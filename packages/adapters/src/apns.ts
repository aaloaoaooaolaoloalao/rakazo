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

export function readApnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | undefined {
  const keyId = env.APNS_KEY_ID?.trim();
  const inline = env.APNS_KEY_P8?.trim();
  const path = env.APNS_KEY_PATH?.trim();
  if (!keyId || (!inline && !path)) return undefined;
  let key = inline ?? "";
  if (!key && path) {
    try {
      key = readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  }
  if (!key.includes("BEGIN PRIVATE KEY")) return undefined;
  const environment = env.APNS_ENV?.trim() === "sandbox" ? "sandbox" : "production";
  return {
    key,
    keyId,
    teamId: env.APNS_TEAM_ID?.trim() || "WNAP7G2A58",
    topic: env.APNS_TOPIC?.trim() || "com.alonshelly.sparkai",
    environment,
  };
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

let cached: { token: string; until: number } | undefined;

export function cachedApnsJwt(config: ApnsConfig, now = Date.now()): string {
  if (cached && cached.until > now) return cached.token;
  const token = createApnsJwt(config, now);
  cached = { token, until: now + JWT_TTL_MS };
  return token;
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
}): Promise<{ status: number; reason?: string }> {
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
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        client.close();
        let reason: string | undefined;
        try {
          reason = JSON.parse(Buffer.concat(chunks).toString("utf8")).reason;
        } catch {
          reason = undefined;
        }
        resolve({ status, reason });
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
        await deliverApns(record.token, message, context, this.tokens);
        return;
      }
      await this.expo.send(message, context);
    } catch (error) {
      getLogger().warn("push failed", { error: error instanceof Error ? error.message : "push" });
    }
  }
}

async function deliverApns(
  deviceToken: string,
  message: NotificationMessage,
  context: AdapterContext,
  tokens: PushTokenStore,
) {
  const config = readApnsConfig();
  if (!config) return;
  if (!allowApnsSend(context.userId, message.threadId)) return;
  const payload = buildApnsPayload(message, context.spaceId);
  const sendOnce = () =>
    postApns({
      config,
      deviceToken,
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
  getLogger().info("apns", { status: result.status, suffix: tokenSuffix(deviceToken) });
  if (action === "drop") await tokens.remove(context.userId);
}

