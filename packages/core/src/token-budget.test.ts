import { describe, expect, it } from "vitest";
import { normalizeRunError } from "./run-error.js";
import {
  MemoryTokenLedger,
  dayWindow,
  decideBudget,
  readTokenLimits,
  tokenLimitExemptEmails,
} from "./token-budget.js";

const limits = { daily: 1_000_000, monthly: 3_000_000, perRun: 250_000 };

describe("token budget", () => {
  it("uses the test-user defaults and treats 0 as unlimited", () => {
    expect(readTokenLimits({})).toEqual(limits);
    expect(readTokenLimits({ USER_TOKEN_LIMIT_DAILY: "0" }).daily).toBe(0);
  });

  it("allows a claim under the limit and blocks a claim that lands exactly on the cap", () => {
    expect(
      decideBudget(limits, empty(999_999), 1),
    ).toEqual({ ok: true });
    expect(decideBudget(limits, empty(1_000_000), 1)).toMatchObject({
      ok: false,
      code: "token_limit",
      window: "day",
    });
  });

  it("stops a run in the middle when the per-run cap is reached", () => {
    const snapshot = { ...empty(0), runUsed: 200_000, runReserved: 0 };
    expect(decideBudget(limits, snapshot, 60_000)).toMatchObject({ window: "run" });
  });

  it("shares one budget across two agents and lets an exempt user pass", async () => {
    const ledger = new MemoryTokenLedger();
    const now = new Date("2026-10-27T12:00:00Z");
    const shared = { ...limits, perRun: 0 };
    const first = await ledger.claim({
      userId: "user",
      runId: "agent-a",
      tokens: 400_000,
      limits: shared,
      now,
      timeZone: "UTC",
    });
    expect(first.ok).toBe(true);
    ledger.settle(first.holdId!, 400_000, now.getTime());
    const second = await ledger.claim({
      userId: "user",
      runId: "agent-b",
      tokens: 700_000,
      limits: shared,
      now,
      timeZone: "UTC",
    });
    expect(second).toMatchObject({ ok: false, window: "day" });
    const exempt = await ledger.claim({
      userId: "user",
      runId: "agent-b",
      tokens: 700_000,
      limits: shared,
      now,
      timeZone: "UTC",
      exempt: true,
    });
    expect(exempt.ok).toBe(true);
    expect(tokenLimitExemptEmails({ USER_TOKEN_LIMIT_EXEMPT_EMAILS: "Me@Example.com, " })).toEqual(
      new Set(["me@example.com"]),
    );
  });

  it("ignores yesterday once the daily window resets", () => {
    const ledger = new MemoryTokenLedger();
    ledger.usage.push({
      userId: "user",
      runId: "run",
      tokens: 1_000_000,
      at: Date.parse("2026-10-26T23:00:00Z"),
    });
    const now = new Date("2026-10-27T01:00:00Z");
    const dailyOnly = { ...limits, perRun: 0 };
    expect(decideBudget(dailyOnly, ledger.snapshot({ userId: "user", runId: "run", now, timeZone: "UTC" }), 1)).toEqual({
      ok: true,
    });
  });

  it("does not let two parallel claims both pass the daily cap", async () => {
    const ledger = new MemoryTokenLedger();
    const now = new Date("2026-10-27T12:00:00Z");
    const [left, right] = await Promise.all([
      ledger.claim({ userId: "user", runId: "a", tokens: 600_000, limits: { ...limits, perRun: 0 }, now, timeZone: "UTC" }),
      ledger.claim({ userId: "user", runId: "b", tokens: 600_000, limits: { ...limits, perRun: 0 }, now, timeZone: "UTC" }),
    ]);
    const admitted = [left, right].filter((row) => row.ok);
    expect(admitted).toHaveLength(1);
  });

  it("keeps an unknown error kind from throwing", () => {
    expect(() => normalizeRunError("some_future_kind")).not.toThrow();
    expect(normalizeRunError("some_future_kind").kind).toBeUndefined();
    expect(normalizeRunError("token_limit")).toMatchObject({
      kind: "token_limit",
      summary: "token_limit",
    });
  });

  it("starts the day at midnight in the user zone", () => {
    const window = dayWindow(new Date("2026-10-27T01:30:00Z"), "Asia/Jerusalem");
    expect(window.start.toISOString()).toBe("2026-10-26T22:00:00.000Z");
  });
});

function empty(dayUsed: number) {
  return {
    dayUsed,
    monthUsed: dayUsed,
    runUsed: 0,
    dayReserved: 0,
    monthReserved: 0,
    runReserved: 0,
  };
}
