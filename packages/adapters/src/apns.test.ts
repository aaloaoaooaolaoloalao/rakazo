import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  allowApnsSend,
  apnsAlertBody,
  apnsEnvironmentFor,
  apnsHost,
  buildApnsPayload,
  cachedApnsJwt,
  classifyApnsError,
  createApnsJwt,
  readApnsConfig,
  resetApnsJwtCacheForTests,
  resolveApnsConfigForDelivery,
} from "./apns.js";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const { privateKey: sandboxPrivateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const sandboxPem = sandboxPrivateKey.export({ type: "pkcs8", format: "pem" }).toString();

const baseEnv = {
  APNS_KEY_ID: "PRODKEY9",
  APNS_KEY_P8: pem,
  APNS_TEAM_ID: "WNAP7G2A58",
  APNS_TOPIC: "com.alonshelly.sparkai",
  APNS_ENV: "production",
} satisfies NodeJS.ProcessEnv;

function baseConfig() {
  const config = readApnsConfig(baseEnv);
  if (!config) throw new Error("expected base config");
  return config;
}

describe("apns", () => {
  it("builds an ES256 JWT with the key id and team", () => {
    const jwt = createApnsJwt(
      { key: pem, keyId: "JY397AHMY9", teamId: "WNAP7G2A58", topic: "com.alonshelly.sparkai", environment: "sandbox" },
      Date.parse("2026-10-27T12:00:00Z"),
    );
    const parts = jwt.split(".");
    const header = JSON.parse(Buffer.from(parts[0] ?? "", "base64url").toString());
    const claims = JSON.parse(Buffer.from(parts[1] ?? "", "base64url").toString());
    expect(header).toMatchObject({ alg: "ES256", kid: "JY397AHMY9" });
    expect(claims).toMatchObject({ iss: "WNAP7G2A58", iat: 1793102400 });
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("builds a collapsed alert and hides a sealed body", () => {
    const payload = buildApnsPayload(
      { kind: "help", title: "Nova", body: "sealed secret", botId: "bot", threadId: "thread" },
      "space",
    );
    expect(payload.aps.alert.body).toBe("הודעה חדשה");
    expect(payload.aps["thread-id"]).toBe("thread");
    expect(payload.threadId).toBe("thread");
    expect(apnsAlertBody("הסוכן סיים")).toBe("הסוכן סיים");
  });

  it("drops a dead device and retries a server error once", () => {
    expect(classifyApnsError(410, "Unregistered")).toBe("drop");
    expect(classifyApnsError(400, "BadDeviceToken")).toBe("drop");
    expect(classifyApnsError(503, "Shutdown")).toBe("retry");
    expect(classifyApnsError(400, "BadTopic")).toBe("ignore");
  });

  it("sends a sandbox token to the sandbox host", () => {
    expect(apnsEnvironmentFor("sandbox", "production")).toBe("sandbox");
    expect(apnsEnvironmentFor(null, "production")).toBe("production");
    expect(apnsHost("sandbox")).toBe("https://api.sandbox.push.apple.com");
    expect(apnsHost("production")).toBe("https://api.push.apple.com");
  });

  it("stays disabled without a key and collapses a chatty thread", () => {
    expect(readApnsConfig({})).toBeUndefined();
    expect(allowApnsSend("user", "thread", 1_000)).toBe(true);
    expect(allowApnsSend("user", "thread", 2_000)).toBe(false);
    expect(allowApnsSend("user", "thread", 30_000)).toBe(true);
  });

  it("uses the sandbox signing key for sandbox devices when sandbox env is set", () => {
    const base = baseConfig();
    const resolved = resolveApnsConfigForDelivery(base, "sandbox", {
      ...baseEnv,
      APNS_SANDBOX_KEY_ID: "SANDKEY1",
      APNS_SANDBOX_KEY_P8: sandboxPem,
    });
    expect(resolved.environment).toBe("sandbox");
    expect(resolved.keyId).toBe("SANDKEY1");
    expect(resolved.key).toBe(sandboxPem);
  });

  it("falls back to the primary key for sandbox devices when sandbox env is missing", () => {
    const base = baseConfig();
    const resolved = resolveApnsConfigForDelivery(base, "sandbox", baseEnv);
    expect(resolved.environment).toBe("sandbox");
    expect(resolved.keyId).toBe("PRODKEY9");
    expect(resolved.key).toBe(pem);
  });

  it("keeps the primary key for production devices even when sandbox env is set", () => {
    const base = baseConfig();
    const resolved = resolveApnsConfigForDelivery(base, "production", {
      ...baseEnv,
      APNS_SANDBOX_KEY_ID: "SANDKEY1",
      APNS_SANDBOX_KEY_P8: sandboxPem,
    });
    expect(resolved.environment).toBe("production");
    expect(resolved.keyId).toBe("PRODKEY9");
    expect(resolved.key).toBe(pem);
  });

  it("caches JWT separately per key id", () => {
    resetApnsJwtCacheForTests();
    const now = Date.parse("2026-10-27T12:00:00Z");
    const shared = {
      key: pem,
      teamId: "WNAP7G2A58",
      topic: "com.alonshelly.sparkai",
      environment: "sandbox" as const,
    };
    const prodJwt = cachedApnsJwt({ ...shared, keyId: "PRODKEY9" }, now);
    const sandJwt = cachedApnsJwt({ ...shared, keyId: "SANDKEY1" }, now);
    expect(prodJwt).not.toBe(sandJwt);
    expect(cachedApnsJwt({ ...shared, keyId: "PRODKEY9" }, now + 1_000)).toBe(prodJwt);
    expect(cachedApnsJwt({ ...shared, keyId: "SANDKEY1" }, now + 1_000)).toBe(sandJwt);
  });
});
