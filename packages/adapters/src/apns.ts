import { createSign, createPrivateKey } from "node:crypto";
import { readFileSync } from "node:fs";
import http2 from "node:http2";
import type { AdapterContext, NotificationMessage, NotificationProvider } from "@rakazo/adapter-kit";
import { getLogger } from "@rakazo/logging";
import type { ExpoPushProvider } from "./expo-push.js";
import type { PushTokenStore } from "./push-token-store.js";

const JWT_TTL_MS = 50 * 60_000;
const MAX_TITLE = 100;
const MAX_BODY = 180;

export interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  topic: string;
  environment: "production" | "sandbox";
}

export interface ApnsKeyMaterial {
  key: string;
  keyId: string;
}

function readApnsKeyMaterial(
  env: NodeJS.ProcessEnv,
  keyIdName: "APNS_KEY_ID" | "APNS_SANDBOX_KEY_ID",
  inlineName: "APNS_KEY_P8" | "APNS_SANDBOX_KEY_P8",
  pathName: "APNS_KEY_PATH" | "APNS_SANDBOX_KEY_PATH",
): ApnsKeyMaterial | undefined {
  const keyId = env[keyIdName]?.trim();
  const inline = env[inlineName];
  const path = env[pathName]?.trim();
  if (!keyId || (!inline?.trim() && !path)) return undefined;
  let key = inline?.length ? inline : "";
  if (!key.trim() && path) {
    try {
      key = readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  }
  if (!key.includes("BEGIN PRIVATE KEY")) return undefined;
  return { key, keyId };
}

export function readApnsSandboxKey(env: NodeJS.ProcessEnv = process.env): ApnsKeyMaterial | undefined {
  return readApnsKeyMaterial(env, "APNS_SANDBOX_KEY_ID", "APNS_SANDBOX_KEY_P8", "APNS_SANDBOX_KEY_PATH");
}

export function readApnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | undefined {
  const material = readApnsKeyMaterial(env, "APNS_KEY_ID", "APNS_KEY_P8", "APNS_KEY_PATH");
  if (!material) return undefined;
  const environment = env.APNS_ENV?.trim() === "sandbox" ? "sandbox" : "production";
  return {
    key: material.key,
    keyId: material.keyId,
    teamId: env.APNS_TEAM_ID?.trim() || "WNAP7G2A58",
    topic: env.APNS_TOPIC?.trim() || "com.alonshelly.sparkai",
    environment,
  };
}

/** Pick host environment and signing key for a stored device record. */
export function resolveApnsConfigForDelivery(
  base: ApnsConfig,
  deviceEnvironment: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): ApnsConfig {
  const environment = apnsEnvironmentFor(deviceEnvironment, base.environment);
  if (environment !== "sandbox") {
    return { ...base, environment };
  }
  const sandboxKey = readApnsSandboxKey(env);
  if (!sandboxKey) {
    return { ...base, environment };
  }
  return { ...base, environment, key: sandboxKey.key, keyId: sandboxKey.keyId };
}

function b64url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

/** ES256 JWT for APNs. Cached by the caller for about 50 minutes. */
export function createApnsJwt(config: ApnsConfig, now = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now / 1000) }));
  const signer = createSign("SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  const signature = signer.sign({ key: createPrivateKey(config.key), dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${b64url(signature)}`;
}

export function apnsHost(environment: ApnsConfig["environment"]): string {
  return environment === "sandbox" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
}

export function apnsEnvironmentFor(
  device: string | null | undefined,
  fallback: ApnsConfig["environment"],
): ApnsConfig["environment"] {
  return device === "sandbox" || device === "production" ? device : fallback;
}

/** Drop a sealed or secret-looking body. The alert stays a short preview. */
export function apnsAlertBody(body: string): string {
  const trimmed = body.trim();
  if (!trimmed || trimmed.length > 400 || /sealed|BEGIN |ciphertext/i.test(trimmed)) {
    return "הודעה חדשה";
  }
  return trimmed.slice(0, MAX_BODY);
}

export function buildApnsPayload(message: NotificationMessage, spaceId: string) {
  return {
    aps: {
      alert: {
        title: message.title.slice(0, MAX_TITLE),
        body: apnsAlertBody(message.body),
      },
      badge: message.badge,
      sound: "default",
      "thread-id": message.threadId,
    },
    kind: message.kind,
    botId: message.botId,
    threadId: message.threadId,
    ...(spaceId ? { spaceId } : {}),
    ...(message.groupId ? { groupId: message.groupId } : {}),
  };
}

export type ApnsFailure = "drop" | "retry" | "ignore";

export function classifyApnsError(status: number, reason: string | undefined): ApnsFailure {
  if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") return "drop";
  if (status >= 500 || status === 429) return "retry";
  return "ignore";
}

export function tokenSuffix(token: string): string {
  return token.slice(-6);
}

let jwtCache = new Map<string, { token: string; until: number }>();

export function cachedApnsJwt(config: ApnsConfig, now = Date.now()): string {
  const hit = jwtCache.get(config.keyId);
  if (hit && hit.until > now) return hit.token;
  const token = createApnsJwt(config, now);
  jwtCache.set(config.keyId, { token, until: now + JWT_TTL_MS });
  return token;
}

export function resetApnsJwtCacheForTests() {
  jwtCache = new Map();
}

const recent = new Map<string, number>();
const MIN_GAP_MS = 20_000;

/** Collapse chatty sends for the same user and conversation. */
export function allowApnsSend(userId: string, threadId: string, now = Date.now()): boolean {
  const key = `${userId}:${threadId}`;
  const last = recent.get(key);
  if (last !== undefined && now - last < MIN_GAP_MS) return false;
  recent.set(key, now);
  return true;
}

export async function postApns(input: {
  config: ApnsConfig;
  deviceToken: string;
  payload: unknown;
  collapseId: string;
  jwt: string;
}): Promise<{ status: number; reason?: string; apnsId?: string }> {
  const body = JSON.stringify(input.payload);
  const url = new URL(`/3/device/${input.deviceToken}`, apnsHost(input.config.environment));
  return new Promise((resolve, reject) => {
    const client = http2.connect(url.origin);
    client.on("error", (error) => {
      client.close();
      reject(error);
    });
    const req = client.request({
      ":method": "POST",
      ":path": url.pathname,
      authorization: `bearer ${input.jwt}`,
      "apns-topic": input.config.topic,
      "apns-push-type": "alert",
      "apns-collapse-id": input.collapseId.slice(0, 64),
      "apns-priority": "10",
    });
    const chunks: Buffer[] = [];
    req.on("response", (headers) => {
      const status = Number(headers[":status"] ?? 0);
      const apnsId = typeof headers["apns-id"] === "string" ? headers["apns-id"] : undefined;
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        client.close();
        let reason: string | undefined;
        try {
          reason = JSON.parse(Buffer.concat(chunks).toString("utf8")).reason;
        } catch {
          reason = undefined;
        }
        resolve({ status, reason, apnsId });
      });
    });
    req.on("error", (error) => {
      client.close();
      reject(error);
    });
    req.end(body);
  });
}

export class RoutedPushProvider implements NotificationProvider {
  constructor(
    private readonly expo: ExpoPushProvider,
    private readonly tokens: PushTokenStore,
  ) {}

  describe() {
    return this.expo.describe();
  }

  async send(message: NotificationMessage, context: AdapterContext): Promise<void> {
    try {
      const record = await this.tokens.load(context.userId);
      if (record?.provider === "apns") {
        await deliverApns(record, message, context, this.tokens);
        return;
      }
      await this.expo.send(message, context);
    } catch (error) {
      getLogger().warn("push failed", { error: error instanceof Error ? error.message : "push" });
    }
  }
}

async function deliverApns(
  record: { token: string; environment?: string | null },
  message: NotificationMessage,
  context: AdapterContext,
  tokens: PushTokenStore,
  options: { force?: boolean } = {},
) {
  const base = readApnsConfig();
  if (!base) {
    getLogger().warn("apns skipped", { reason: "config" });
    return { status: 0, reason: "config", environment: "production" as const };
  }
  const config = resolveApnsConfigForDelivery(base, record.environment);
  const environment = config.environment;
  if (!options.force && !allowApnsSend(context.userId, message.threadId)) {
    getLogger().info("apns skipped", { reason: "rate", environment, suffix: tokenSuffix(record.token) });
    return { status: 0, reason: "rate", environment };
  }
  const payload = buildApnsPayload(message, context.spaceId);
  getLogger().info("apns send", {
    environment,
    keyId: config.keyId,
    topic: config.topic,
    suffix: tokenSuffix(record.token),
  });
  const sendOnce = () =>
    postApns({
      config,
      deviceToken: record.token,
      payload,
      collapseId: message.threadId,
      jwt: cachedApnsJwt(config),
    });
  let result = await sendOnce();
  let action = classifyApnsError(result.status, result.reason);
  if (action === "retry") {
    result = await sendOnce();
    action = classifyApnsError(result.status, result.reason);
  }
  getLogger().info("apns result", {
    status: result.status,
    reason: result.reason,
    apnsId: result.apnsId,
    environment,
    suffix: tokenSuffix(record.token),
  });
  if (action === "drop") await tokens.remove(context.userId);
  return { status: result.status, reason: result.reason, apnsId: result.apnsId, environment };
}

export async function sendApnsTest(
  tokens: PushTokenStore,
  userId: string,
  spaceId: string,
): Promise<{ status: number; reason?: string; apnsId?: string; environment: string }> {
  const record = await tokens.load(userId);
  if (!record || record.provider !== "apns") {
    return { status: 0, reason: "no_token", environment: "production" };
  }
  return deliverApns(
    record,
    {
      kind: "completion",
      title: "SparkAI",
      body: "בדיקת התראה",
      botId: "test",
      threadId: `test:${userId}`,
    },
    {
      operationId: "push.test",
      traceId: "push.test",
      spaceId,
      userId,
      botId: "test",
      signal: new AbortController().signal,
    },
    tokens,
    { force: true },
  );
}

