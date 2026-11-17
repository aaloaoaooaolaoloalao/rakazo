import { createHmac, generateKeyPairSync, sign } from "node:crypto";
import type { TransactionalEmail } from "@rakazo/adapter-kit";
import type * as Db from "@rakazo/db";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthEnv } from "./index.js";
import { createAuth, verificationCodeEmail } from "./index.js";

const state = vi.hoisted(() => ({ db: {} as Record<string, Record<string, unknown>[]> }));
vi.mock("better-auth/adapters/prisma", () => ({ prismaAdapter: () => memoryAdapter(state.db) }));
vi.mock("@rakazo/db", async (original) => ({
  ...(await original<typeof Db>()),
  bootstrapUserSpace: vi.fn(),
}));

const origin = "https://rakazo.example.test";
const bundleId = "com.example.sparkai";
const password = "test-password-123";
const secret = "offline-test-secret-with-at-least-32-characters";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "apple-key", alg: "RS256", use: "sig" };
const clientKey = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();

let messages: TransactionalEmail[];
let buckets: Map<string, number>;
let prisma: Record<string, unknown>;

const rows = (model: string) => state.db[model] ?? [];
const userOf = (email: string) => rows("user").find((row) => row.email === email);
const sessionsOf = (userId: unknown) => rows("session").filter((row) => row.userId === userId);

function offlineEmail(): NonNullable<AuthEnv["email"]> {
  return {
    describe: () => ({
      id: "offline-email",
      contractVersion: "1",
      adapterVersion: "1",
      capabilities: { transactional: true },
    }),
    send: vi.fn(async (message: TransactionalEmail) => {
      messages.push(message);
    }),
  };
}

function makeAuth(overrides: Partial<AuthEnv> = {}) {
  return createAuth(prisma as never, {
    secret,
    baseURL: origin,
    webOrigin: origin,
    signupsEnabled: "true",
    signupAllowlist: undefined,
    email: offlineEmail(),
    emailVerificationCodes: true,
    requireEmailVerification: true,
    apple: {
      clientId: bundleId,
      appBundleIdentifier: bundleId,
      teamId: "TEAM000000",
      keyId: "KEY000000",
      key: clientKey,
    },
    ...overrides,
  });
}

let auth: ReturnType<typeof makeAuth>;

async function request(path: string, body: unknown, headers: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

const signUp = (email: string) => request("/sign-up/email", { email, password, name: "New" });
const signIn = (email: string) => request("/sign-in/email", { email, password });
const sendCode = (email: string, type = "email-verification") =>
  request("/email-otp/send-verification-otp", { email, type });
const verify = (email: string, otp: string) => request("/email-otp/verify-email", { email, otp });
const codeIn = (message: TransactionalEmail | undefined) =>
  message?.text.match(/\b\d{6}\b/)?.[0] ?? "";
const mailFor = async (email: string, count: number) => {
  await vi.waitFor(() =>
    expect(messages.filter((message) => message.to === email)).toHaveLength(count),
  );
  return messages.filter((message) => message.to === email).at(-1);
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T10:00:05Z"));
  messages = [];
  buckets = new Map();
  state.db = {
    user: [],
    session: [],
    account: [],
    verification: [],
    organization: [],
    member: [],
    invitation: [],
  };
  prisma = {
    deploymentSettings: { findUnique: vi.fn(async () => null) },
    spaceMember: { findFirst: vi.fn(async () => ({ id: "space", spaceId: "space" })) },
    apiRateBucket: {
      upsert: vi.fn(
        async ({ where }: { where: { key_windowStart: { key: string; windowStart: Date } } }) => {
          const id = `${where.key_windowStart.key}@${where.key_windowStart.windowStart.getTime()}`;
          const count = (buckets.get(id) ?? 0) + 1;
          buckets.set(id, count);
          return { count, key: where.key_windowStart.key, windowStart: new Date() };
        },
      ),
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
  };
  prisma.$transaction = vi.fn(async (operations: (tx: unknown) => Promise<unknown>) =>
    operations(prisma),
  );
  auth = makeAuth();
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
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("email verification by code", () => {
  it("mails a 6-digit code on sign-up and gives no session until it is confirmed", async () => {
    const response = await signUp("new@example.test");
    expect(response.status, await response.clone().text()).toBe(200);
    expect(await response.json()).toMatchObject({ token: null });
    const user = userOf("new@example.test")!;
    expect(user.emailVerified).toBe(false);
    expect(sessionsOf(user.id)).toHaveLength(0);
    const mail = await mailFor("new@example.test", 1);
    expect(mail!.subject).toContain("SparkAI");
    expect(mail!.text).toMatch(/קוד האימות/);
    expect(mail!.text).toMatch(/verification code/);
    expect(mail!.text).not.toMatch(/https?:\/\//);
    expect(codeIn(mail)).toMatch(/^\d{6}$/);
  });

  it("verifies the address with the code and signs the app in with a bearer token", async () => {
    await signUp("new@example.test");
    const otp = codeIn(await mailFor("new@example.test", 1));
    const response = await verify("new@example.test", otp);
    expect(response.status, await response.clone().text()).toBe(200);
    const body = (await response.json()) as { token: unknown };
    expect(body).toMatchObject({ status: true, user: { emailVerified: true } });
    expect(typeof body.token).toBe("string");
    const session = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${body.token}` }),
    });
    expect(session?.user.email).toBe("new@example.test");
    expect((await signIn("new@example.test")).status).toBe(200);
  });

  it("refuses password sign-in for an unverified address with EMAIL_NOT_VERIFIED", async () => {
    await signUp("new@example.test");
    await mailFor("new@example.test", 1);
    const response = await signIn("new@example.test");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(sessionsOf(userOf("new@example.test")!.id)).toHaveLength(0);
  });

  it("mails a fresh code on a refused sign-in once the cooldown has passed", async () => {
    await signUp("new@example.test");
    const first = codeIn(await mailFor("new@example.test", 1));
    // Inside the cooldown nothing is sent and the first code still works later.
    expect((await signIn("new@example.test")).status).toBe(403);
    await settle();
    expect(messages).toHaveLength(1);
    vi.setSystemTime(new Date("2026-11-17T10:01:10Z"));
    expect((await signIn("new@example.test")).status).toBe(403);
    const second = codeIn(await mailFor("new@example.test", 2));
    expect((await verify("new@example.test", first)).status).toBe(400);
    expect((await verify("new@example.test", second)).status).toBe(200);
    expect(first).toMatch(/^\d{6}$/);
  });

  it("allows one code request per address per minute", async () => {
    await signUp("new@example.test");
    await mailFor("new@example.test", 1);
    const early = await sendCode("new@example.test");
    expect(early.status).toBe(429);
    expect(early.headers.get("retry-after")).toBe("60");
    expect(await early.json()).toMatchObject({ code: "OTP_RESEND_COOLDOWN" });
    vi.setSystemTime(new Date("2026-11-17T10:01:10Z"));
    expect((await sendCode("new@example.test")).status).toBe(200);
    await mailFor("new@example.test", 2);
  });

  it("answers the same for unknown and verified addresses without mailing them", async () => {
    expect((await sendCode("nobody@example.test")).status).toBe(200);
    rows("user").push({
      id: "verified-user",
      name: "Verified",
      email: "verified@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    expect((await sendCode("verified@example.test")).status).toBe(200);
    await settle();
    expect(messages).toHaveLength(0);
  });

  it("rejects a wrong code and locks the code after too many attempts", async () => {
    await signUp("new@example.test");
    const otp = codeIn(await mailFor("new@example.test", 1));
    const wrong = otp === "000000" ? "111111" : "000000";
    const first = await verify("new@example.test", wrong);
    expect(first.status).toBe(400);
    expect(await first.json()).toMatchObject({ code: "INVALID_OTP" });
    await verify("new@example.test", wrong);
    await verify("new@example.test", wrong);
    const locked = await verify("new@example.test", otp);
    expect(locked.status).toBeGreaterThanOrEqual(400);
    expect(await locked.json()).toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    expect(userOf("new@example.test")!.emailVerified).toBe(false);
  });

  it("expires a code after ten minutes", async () => {
    await signUp("new@example.test");
    const otp = codeIn(await mailFor("new@example.test", 1));
    vi.setSystemTime(new Date("2026-11-17T10:10:10Z"));
    const response = await verify("new@example.test", otp);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "OTP_EXPIRED" });
  });

  it("signs a new Apple user in at once, with no code", async () => {
    const nonce = "apple-nonce";
    const response = await request("/sign-in/social", {
      provider: "apple",
      idToken: {
        token: appleIdToken({
          nonce,
          sub: "apple-subject",
          email: "apple@example.test",
          email_verified: true,
        }),
        nonce,
      },
    });
    expect(response.status, await response.clone().text()).toBe(200);
    const user = userOf("apple@example.test")!;
    expect(user.emailVerified).toBe(true);
    expect(sessionsOf(user.id)).toHaveLength(1);
    await settle();
    expect(messages).toHaveLength(0);
  });

  it("keeps an existing unverified session working but asks for the code on next sign-in", async () => {
    auth = makeAuth({ requireEmailVerification: false });
    expect((await signUp("legacy@example.test")).status).toBe(200);
    const legacy = userOf("legacy@example.test")!;
    const token = rows("session").find((row) => row.userId === legacy.id)!.token as string;
    auth = makeAuth();
    const signature = createHmac("sha256", secret).update(token).digest("base64");
    const session = await auth.api.getSession({
      headers: new Headers({ authorization: `Bearer ${token}.${signature}` }),
    });
    expect(session?.user.id).toBe(legacy.id);
    const response = await signIn("legacy@example.test");
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
  });

  it("keeps sign-up open with a session when verification is not required", async () => {
    auth = makeAuth({ requireEmailVerification: false });
    const response = await signUp("open@example.test");
    expect(response.status).toBe(200);
    expect(((await response.json()) as { token: unknown }).token).toEqual(expect.any(String));
    const otp = codeIn(await mailFor("open@example.test", 1));
    expect((await verify("open@example.test", otp)).status).toBe(200);
    expect(userOf("open@example.test")!.emailVerified).toBe(true);
  });

  it("keeps the verification routes closed unless codes are turned on", async () => {
    auth = makeAuth({ emailVerificationCodes: false, requireEmailVerification: false });
    expect((await sendCode("new@example.test")).status).toBe(404);
    expect((await verify("new@example.test", "123456")).status).toBe(404);
  });

  it("refuses to start without an email provider", () => {
    expect(() => makeAuth({ email: undefined })).toThrow(/email provider/);
  });
});

describe("verificationCodeEmail", () => {
  it("writes Hebrew and English with the code and no link", () => {
    const mail = verificationCodeEmail("a@example.test", "123456");
    expect(mail.to).toBe("a@example.test");
    expect(mail.subject).toBe("קוד האימות שלך ל-SparkAI | Your SparkAI verification code");
    expect(mail.text).toContain("123456");
    expect(mail.html).toContain('dir="rtl"');
    expect(mail.html).toContain("123456");
    expect(mail.html).not.toMatch(/href=/);
  });
});
