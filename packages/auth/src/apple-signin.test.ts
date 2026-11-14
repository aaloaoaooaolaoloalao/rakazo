import { generateKeyPairSync, sign } from "node:crypto";
import type * as Db from "@rakazo/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Auth } from "./index.js";
import { createAuth } from "./index.js";

const state = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: () => memoryAdapter(state.db) }));
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof Db>()),
  bootstrapUserSpace: vi.fn(),
}));

const origin = "https://rakazo.example.test";
const bundleId = "com.example.sparkai";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "apple-key", alg: "RS256", use: "sig" };
const clientKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
let auth: Auth;

const rows = (model: string) => state.db[model] ?? [];
const sessionsOf = (userId: unknown) => rows("session").filter((row) => row.userId === userId);

function appleIdToken(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "apple-key" })).toString(
    "base64url",
  );
  const payload = Buffer.from(
    JSON.stringify({
      iss: "https://appleid.apple.com",
      aud: bundleId,
      iat: now,
      exp: now + 300,
      ...claims,
    }),
  ).toString("base64url");
  const data = `${header}.${payload}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}

async function request(path: string, body: unknown) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function signInWithApple(claims: Record<string, unknown>) {
  const nonce = "apple-nonce";
  return request("/sign-in/social", {
    provider: "apple",
    idToken: { token: appleIdToken({ nonce, ...claims }), nonce },
  });
}

async function localUser(email: string, emailVerified: boolean) {
  const response = await request("/sign-up/email", {
    email,
    password: "test-password-123",
    name: "Local",
  });
  expect(response.status).toBe(200);
  const user = rows("user").find((row) => row.email === email)!;
  user.emailVerified = emailVerified;
  return user;
}

beforeEach(() => {
  state.db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    organization: [],
    member: [],
    invitation: [],
  };
  const prisma: Record<string, unknown> = {
    deploymentSettings: { findUnique: vi.fn(async () => null) },
    spaceMember: { findFirst: vi.fn(async () => ({ id: "space", spaceId: "space" })) },
    apiRateBucket: {
      upsert: vi.fn(async () => ({ count: 1, key: "auth-email:fixture", windowStart: new Date() })),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  prisma.$transaction = vi.fn(async (operations: (tx: unknown) => Promise<unknown>) =>
    operations(prisma),
  );
  auth = createAuth(prisma as never, {
    secret: "offline-test-secret-with-at-least-32-characters",
    baseURL: origin,
    webOrigin: origin,
    signupsEnabled: "true",
    signupAllowlist: undefined,
    email: {
      describe: () => ({
        id: "offline-email",
        contractVersion: "1",
        adapterVersion: "1",
        capabilities: { transactional: true },
      }),
      send: vi.fn(async () => undefined),
    },
    apple: {
      clientId: bundleId,
      appBundleIdentifier: bundleId,
      teamId: "TEAM000000",
      keyId: "KEY000000",
      key: clientKey,
    },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.href === "https://appleid.apple.com/auth/keys") return Response.json({ keys: [jwk] });
      throw new Error("Unexpected offline request");
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Sign in with Apple account linking", () => {
  it.each([true, "true"])(
    "links a verified Apple email (email_verified=%s) to a verified local account",
    async (verified) => {
      const local = await localUser("owner@example.test", true);
      const response = await signInWithApple({
        sub: "apple-subject",
        email: "owner@example.test",
        email_verified: verified,
      });
      expect(response.status, await response.clone().text()).toBe(200);
      expect(await response.json()).toMatchObject({ user: { id: local.id } });
      expect(rows("user")).toHaveLength(1);
      expect(rows("account").map((account) => [account.providerId, account.userId])).toEqual([
        ["credential", local.id],
        ["apple", local.id],
      ]);
    },
  );

  it("refuses to link into a local account whose email was never verified", async () => {
    const squatter = await localUser("victim@example.test", false);
    const sessions = sessionsOf(squatter.id).length;
    const response = await signInWithApple({
      sub: "apple-subject",
      email: "victim@example.test",
      email_verified: true,
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(rows("account").map((account) => account.providerId)).toEqual(["credential"]);
    expect(sessionsOf(squatter.id)).toHaveLength(sessions);
    expect(rows("user")).toHaveLength(1);
  });

  it.each([false, "false", undefined])(
    "refuses to link when Apple reports email_verified=%s",
    async (verified) => {
      const local = await localUser("owner@example.test", true);
      const sessions = sessionsOf(local.id).length;
      const response = await signInWithApple({
        sub: "apple-subject",
        email: "owner@example.test",
        ...(verified === undefined ? {} : { email_verified: verified }),
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(rows("account").map((account) => account.providerId)).toEqual(["credential"]);
      expect(sessionsOf(local.id)).toHaveLength(sessions);
    },
  );

  it("creates a separate account for a Hide My Email address", async () => {
    const local = await localUser("owner@example.test", true);
    const response = await signInWithApple({
      sub: "apple-subject",
      email: "x7k2q9@privaterelay.appleid.com",
      email_verified: "true",
      is_private_email: "true",
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const created = rows("user").find((row) => row.email === "x7k2q9@privaterelay.appleid.com");
    expect(created).toMatchObject({ emailVerified: true });
    expect(created!.id).not.toBe(local.id);
    expect(rows("account").find((account) => account.providerId === "apple")).toMatchObject({
      userId: created!.id,
    });
  });

  it("signs a returning Apple user back into the same account", async () => {
    const claims = { sub: "apple-subject", email: "owner@example.test", email_verified: true };
    const first = await signInWithApple(claims);
    expect(first.status, await first.clone().text()).toBe(200);
    const again = await signInWithApple(claims);
    expect(again.status, await again.clone().text()).toBe(200);
    expect(rows("user")).toHaveLength(1);
    expect(rows("account")).toHaveLength(1);
    expect(sessionsOf(rows("user")[0]!.id)).toHaveLength(2);
  });

  it("signs an already linked Apple account in without repeating the link checks", async () => {
    const local = await localUser("owner@example.test", true);
    const claims = { sub: "apple-subject", email: "owner@example.test", email_verified: true };
    expect((await signInWithApple(claims)).status).toBe(200);
    local.emailVerified = false;
    const again = await signInWithApple(claims);
    expect(again.status, await again.clone().text()).toBe(200);
    expect(await again.json()).toMatchObject({ user: { id: local.id } });
  });
});
