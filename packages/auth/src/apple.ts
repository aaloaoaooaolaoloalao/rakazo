import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";

/** Native Sign in with Apple (Better Auth `socialProviders.apple`). */
export interface AppleSignInConfig {
  clientId: string;
  appBundleIdentifier: string;
  teamId: string;
  keyId: string;
  key: string;
}

export interface AppleKeyMaterial {
  key: string;
  keyId: string;
}

const CLIENT_SECRET_TTL_MS = 50 * 60_000;
/** Apple allows up to six months; stay well under that when minting. */
const CLIENT_SECRET_MAX_AGE_S = 60 * 60 * 24 * 150;

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function readAppleKeyMaterial(env: NodeJS.ProcessEnv): AppleKeyMaterial | undefined {
  const keyId = env.APPLE_KEY_ID?.trim();
  const inline = env.APPLE_KEY_P8;
  const path = env.APPLE_KEY_PATH?.trim();
  if (!keyId || (!inline?.trim() && !path)) return undefined;
  let key = inline?.length ? inline : "";
  if (!key.trim() && path) {
    try {
      key = readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  }
  key = key.replace(/\\n/g, "\n");
  if (!key.includes("BEGIN PRIVATE KEY")) return undefined;
  return { key, keyId };
}

/**
 * Reads Sign in with Apple settings. Partial configuration yields `undefined` so
 * auth can start with Apple sign-in disabled (same spirit as optional OIDC).
 */
export function appleAuthFromEnv(source: NodeJS.ProcessEnv = process.env): AppleSignInConfig | undefined {
  const clientId = source.APPLE_CLIENT_ID?.trim();
  const teamId = source.APPLE_TEAM_ID?.trim();
  const material = readAppleKeyMaterial(source);
  const touched =
    Boolean(clientId) ||
    Boolean(teamId) ||
    Boolean(material) ||
    Boolean(source.APPLE_KEY_P8?.trim()) ||
    Boolean(source.APPLE_KEY_PATH?.trim()) ||
    Boolean(source.APPLE_APP_BUNDLE_IDENTIFIER?.trim());
  if (!touched) return undefined;
  if (!clientId || !teamId || !material) return undefined;
  const appBundleIdentifier = source.APPLE_APP_BUNDLE_IDENTIFIER?.trim() || clientId;
  return {
    clientId,
    appBundleIdentifier,
    teamId,
    keyId: material.keyId,
    key: material.key,
  };
}

/** ES256 client secret JWT for Apple's token endpoint (`aud` = Apple ID). */
export function createAppleClientSecret(config: AppleSignInConfig, now = Date.now()): string {
  const iat = Math.floor(now / 1_000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = b64url(
    JSON.stringify({
      iss: config.teamId,
      iat,
      exp: iat + CLIENT_SECRET_MAX_AGE_S,
      aud: "https://appleid.apple.com",
      sub: config.clientId,
    }),
  );
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = signer.sign({ key: createPrivateKey(config.key), dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${b64url(signature)}`;
}

let secretCache = new Map<string, { token: string; until: number }>();

export function cachedAppleClientSecret(config: AppleSignInConfig, now = Date.now()): string {
  const hit = secretCache.get(config.keyId);
  if (hit && hit.until > now) return hit.token;
  const token = createAppleClientSecret(config, now);
  secretCache.set(config.keyId, { token, until: now + CLIENT_SECRET_TTL_MS });
  return token;
}

export function resetAppleClientSecretCacheForTests() {
  secretCache = new Map();
}

export function appleSocialProviderOptions(
  config: AppleSignInConfig,
): () => Promise<{
  clientId: string;
  clientSecret: string;
  appBundleIdentifier: string;
}> {
  return async () => ({
    clientId: config.clientId,
    clientSecret: cachedAppleClientSecret(config),
    appBundleIdentifier: config.appBundleIdentifier,
  });
}
