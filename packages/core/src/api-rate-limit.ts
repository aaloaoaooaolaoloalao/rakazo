export const RATE_LIMITED_CODE = "RATE_LIMITED";

export type RateBucket = "general" | "send" | "artifact" | "connect" | "messaging" | "voice" | "exempt";

/** Health and static assets are not RPC and never reach this classifier. */
export function rateBucket(pathname: string): RateBucket {
  const path = pathname.replace(/\/+$/, "");
  if (path.endsWith("/threads/send") || path.endsWith("/runs/start")) return "send";
  if (path.endsWith("/artifacts/create")) return "artifact";
  if (path.endsWith("/connections/begin")) return "connect";
  if (path.includes("/messaging")) return "messaging";
  if (path.includes("/voice")) return "voice";
  return "general";
}

export interface RateLimits {
  userPerMinute: number;
  ipPerMinute: number;
  sendPerMinute: number;
  artifactPerMinute: number;
  connectPerMinute: number;
  messagingPerMinute: number;
  voicePerMinute: number;
}

export function readRateLimits(env: NodeJS.ProcessEnv = process.env): RateLimits {
  const read = (raw: string | undefined, fallback: number) => {
    if (raw === undefined || raw.trim() === "") return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.floor(parsed);
  };
  return {
    userPerMinute: read(env.API_RATE_LIMIT_PER_MINUTE_USER, 120),
    ipPerMinute: read(env.API_RATE_LIMIT_PER_MINUTE_IP, 300),
    sendPerMinute: read(env.API_RATE_LIMIT_SEND_PER_MINUTE, 20),
    artifactPerMinute: read(env.API_RATE_LIMIT_ARTIFACTS_PER_MINUTE, 20),
    connectPerMinute: read(env.API_RATE_LIMIT_CONNECT_PER_MINUTE, 20),
    messagingPerMinute: read(env.API_RATE_LIMIT_MESSAGING_PER_MINUTE, 20),
    voicePerMinute: read(env.API_RATE_LIMIT_VOICE_PER_MINUTE, 20),
  };
}

export function bucketLimit(limits: RateLimits, bucket: RateBucket, signedIn: boolean): number {
  if (bucket === "exempt") return 0;
  if (bucket === "send") return limits.sendPerMinute;
  if (bucket === "artifact") return limits.artifactPerMinute;
  if (bucket === "connect") return limits.connectPerMinute;
  if (bucket === "messaging") return limits.messagingPerMinute;
  if (bucket === "voice") return limits.voicePerMinute;
  return signedIn ? limits.userPerMinute : limits.ipPerMinute;
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/** `count` is the count after this request is included. 0 limit means unlimited. */
export function decideRate(count: number, limit: number, elapsedMs: number): RateDecision {
  if (limit <= 0) return { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0 };
  const allowed = count <= limit;
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((60_000 - elapsedMs) / 1000));
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

export class MemoryRateLedger {
  private counts = new Map<string, { window: number; count: number }>();

  take(key: string, now: number, limit: number): RateDecision {
    const window = Math.floor(now / 60_000);
    const current = this.counts.get(key);
    const count = current && current.window === window ? current.count + 1 : 1;
    this.counts.set(key, { window, count });
    return decideRate(count, limit, now - window * 60_000);
  }
}
