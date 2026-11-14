import type * as Db from "@rakazo/db";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { limitRpc } from "./rpc-rate-limit.js";

const recorded = vi.hoisted(() => [] as unknown[]);
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof Db>()),
  recordSecurityEvent: vi.fn(async (event: unknown) => {
    recorded.push(event);
  }),
}));
vi.mock("./client-ip.js", () => ({
  requestClientIp: (c: { req: { header: (name: string) => string | undefined } }) =>
    c.req.header("x-test-ip"),
}));

function fakeDb() {
  const rows = new Map<string, number>();
  return {
    apiRateBucket: {
      upsert: vi.fn(
        async ({ where }: { where: { key_windowStart: { key: string; windowStart: Date } } }) => {
          const id = `${where.key_windowStart.key}|${where.key_windowStart.windowStart.getTime()}`;
          const count = (rows.get(id) ?? 0) + 1;
          rows.set(id, count);
          return { count };
        },
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
}

function appFor(userId: string | undefined, db = fakeDb()) {
  const app = new Hono();
  app.all("*", async (c) => (await limitRpc(c, db as never, userId)) ?? c.text("ok"));
  return app;
}

const hit = (app: Hono, path: string, ip = "203.0.113.9") =>
  app.request(path, { method: "POST", headers: { "x-test-ip": ip } });

beforeEach(() => {
  recorded.length = 0;
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-14T12:00:05Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("limitRpc", () => {
  it("answers 429 with Retry-After and records one event for a flood", async () => {
    vi.stubEnv("API_RATE_LIMIT_PER_MINUTE_USER", "10");
    const app = appFor("user-1");
    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 384; i++) {
      last = await hit(app, "/rpc/bots/update");
      statuses.push(last.status);
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(10);
    expect(last!.status).toBe(429);
    expect(last!.headers.get("retry-after")).toBe("55");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      type: "rate_limit.hit",
      userId: "user-1",
      metadata: { bucket: "general", scope: "user", limit: 10 },
    });
  });

  it("records again in the next window, still once", async () => {
    vi.stubEnv("API_RATE_LIMIT_PER_MINUTE_USER", "1");
    const app = appFor("user-1");
    for (let i = 0; i < 5; i++) await hit(app, "/rpc/bots/update");
    vi.setSystemTime(new Date("2026-11-14T12:01:05Z"));
    for (let i = 0; i < 5; i++) await hit(app, "/rpc/bots/update");
    expect(recorded).toHaveLength(2);
  });

  it("caps one address across accounts, but separately per address", async () => {
    vi.stubEnv("API_RATE_LIMIT_IP_TOTAL_PER_MINUTE", "3");
    const db = fakeDb();
    const results = [];
    for (const user of ["a", "b", "c", "d"]) {
      results.push((await hit(appFor(user, db), "/rpc/bots/update")).status);
    }
    expect(results).toEqual([200, 200, 200, 429]);
    expect((await hit(appFor("e", db), "/rpc/bots/update", "198.51.100.1")).status).toBe(200);
    expect(recorded).toEqual([
      expect.objectContaining({ metadata: expect.objectContaining({ scope: "ip" }) }),
    ]);
  });

  it("limits auth attempts per address without closing sign-up", async () => {
    vi.stubEnv("API_RATE_LIMIT_AUTH_PER_MINUTE", "2");
    const app = appFor(undefined);
    expect((await hit(app, "/api/auth/sign-up/email")).status).toBe(200);
    expect((await hit(app, "/api/auth/sign-up/email")).status).toBe(200);
    expect((await hit(app, "/api/auth/sign-up/email")).status).toBe(429);
    expect((await hit(app, "/api/auth/sign-up/email", "198.51.100.7")).status).toBe(200);
    expect((await hit(app, "/api/auth/get-session")).status).toBe(200);
  });

  it("fails open when the bucket table is unavailable", async () => {
    vi.stubEnv("API_RATE_LIMIT_PER_MINUTE_USER", "1");
    const db = { apiRateBucket: { upsert: vi.fn().mockRejectedValue(new Error("down")) } };
    const app = appFor("user-1", db as never);
    expect((await hit(app, "/rpc/bots/update")).status).toBe(200);
    expect((await hit(app, "/rpc/bots/update")).status).toBe(200);
  });
});
