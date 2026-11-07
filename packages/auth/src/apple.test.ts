import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  appleAuthFromEnv,
  appleSocialProviderOptions,
  cachedAppleClientSecret,
  createAppleClientSecret,
  resetAppleClientSecretCacheForTests,
} from "./apple.js";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

/** Must stay below createAppleClientSecret cache TTL in apple.ts. */
const CLIENT_SECRET_WINDOW_MS = 50 * 60_000;

const baseEnv = {
  APPLE_CLIENT_ID: "com.example.sparkai",
  APPLE_APP_BUNDLE_IDENTIFIER: "com.example.sparkai",
  APPLE_TEAM_ID: "TEAM000000",
  APPLE_KEY_ID: "KEY000000",
  APPLE_KEY_P8: pem,
} satisfies NodeJS.ProcessEnv;

function decodeJwtPart(jwt: string, index: 0 | 1) {
  return JSON.parse(Buffer.from(jwt.split(".")[index] ?? "", "base64url").toString());
}

describe("apple auth env", () => {
  afterEach(() => resetAppleClientSecretCacheForTests());

  it("returns undefined when Apple env is absent", () => {
    expect(appleAuthFromEnv({})).toBeUndefined();
  });

  it("returns undefined for partial Apple env without failing", () => {
    expect(appleAuthFromEnv({ APPLE_CLIENT_ID: "com.example.app" })).toBeUndefined();
    expect(appleAuthFromEnv({ ...baseEnv, APPLE_TEAM_ID: "" })).toBeUndefined();
  });

  it("reads a key from APPLE_KEY_PATH", () => {
    const dir = mkdtempSync(join(tmpdir(), "apple-key-"));
    const path = join(dir, "AuthKey.p8");
    writeFileSync(path, pem, "utf8");
    const config = appleAuthFromEnv({
      APPLE_CLIENT_ID: baseEnv.APPLE_CLIENT_ID,
      APPLE_TEAM_ID: baseEnv.APPLE_TEAM_ID,
      APPLE_KEY_ID: baseEnv.APPLE_KEY_ID,
      APPLE_KEY_PATH: path,
    });
    expect(config?.key).toContain("BEGIN PRIVATE KEY");
  });

  it("mints an Apple client secret JWT with expected claims", () => {
    const config = appleAuthFromEnv(baseEnv);
    if (!config) throw new Error("expected config");
    const jwt = createAppleClientSecret(config, Date.parse("2026-01-01T00:00:00Z"));
    expect(decodeJwtPart(jwt, 0)).toMatchObject({ alg: "ES256", kid: "KEY000000" });
    expect(decodeJwtPart(jwt, 1)).toMatchObject({
      iss: "TEAM000000",
      aud: "https://appleid.apple.com",
      sub: "com.example.sparkai",
      iat: 1767225600,
    });
    expect(jwt.split(".")).toHaveLength(3);
  });

  it("caches client secrets by key id", () => {
    const config = appleAuthFromEnv(baseEnv);
    if (!config) throw new Error("expected config");
    const first = cachedAppleClientSecret(config, 1_000_000);
    const second = cachedAppleClientSecret(config, 1_000_000 + 1_000);
    const third = cachedAppleClientSecret(config, 1_000_000 + CLIENT_SECRET_WINDOW_MS);
    expect(second).toBe(first);
    expect(third).not.toBe(first);
  });

  it("builds async Better Auth provider options", async () => {
    const config = appleAuthFromEnv(baseEnv);
    if (!config) throw new Error("expected config");
    const options = await appleSocialProviderOptions(config)();
    expect(options).toMatchObject({
      clientId: "com.example.sparkai",
      appBundleIdentifier: "com.example.sparkai",
    });
    expect(options.clientSecret.split(".")).toHaveLength(3);
  });
});
