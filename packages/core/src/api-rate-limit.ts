export const RATE_LIMITED_CODE = "RATE_LIMITED";

export type RateBucket =
  | "auth"
  | "general"
  | "read"
  | "stream"
  | "send"
  | "artifact"
  | "connect"
  | "messaging"
  | "voice"
  | "bug_report"
  | "exempt";

export const RATE_WINDOW_MS = 60_000;
export const BUG_REPORT_WINDOW_MS = 60 * 60_000;

/**
 * Procedures a client polls or loads in bulk when a screen opens. They only read, so they get
 * their own, larger bucket and never starve writes in "general".
 */
const READ_PROCEDURE = /\/(get|list|listArchived|head|messages|status|summary|snapshot)$/;
/** Long-lived event streams (`threads.subscribe`, `notifications.subscribeCalls`, ...). */
const STREAM_PROCEDURE = /\/subscribe[A-Za-z]*$/;

/**
 * `/api/*` routes that authenticate something other than a user session (webhooks, paired
 * devices, browser telemetry), so the API limiter skips them.
 */
const EXEMPT_API_PREFIXES = [
  "/api/v1/",
  "/api/devices/",
  "/api/monitoring/",
  "/api/csp-report/",
  "/api/desktop-settings/",
  "/api/dev/",
] as const;

/** Health and static assets never reach this classifier; `/rpc/health` is exempt here. */
export function rateBucket(pathname: string): RateBucket {
  const path = pathname.replace(/\/+$/, "");
  if (`${path}/`.startsWith("/api/")) return apiRateBucket(path);
  if (path.endsWith("/health")) return "exempt";
  if (STREAM_PROCEDURE.test(path)) return "stream";
  if (
    path.endsWith("/threads/send") ||
    path.endsWith("/threads/sendWithRoutines") ||
    path.endsWith("/runs/start")
  )
    return "send";
  if (path.endsWith("/artifacts/create")) return "artifact";
  if (path.endsWith("/connections/begin")) return "connect";
  if (READ_PROCEDURE.test(path)) return "read";
  if (path.includes("/messaging")) return "messaging";
  if (path.includes("/voice")) return "voice";
  return "general";
}

/** Better Auth reads the session on every page load; that is a read, not a sign-in attempt. */
const AUTH_READ_PATHS = new Set(["/api/auth/get-session", "/api/auth/capabilities"]);

function apiRateBucket(path: string): RateBucket {
  if (AUTH_READ_PATHS.has(path)) return "read";
  // Sign-in, sign-up, codes and OAuth callbacks: limited per address, never closed.
  if (`${path}/`.startsWith("/api/auth/")) return "auth";
  if (EXEMPT_API_PREFIXES.some((prefix) => `${path}/`.startsWith(prefix))) return "exempt";
  if (path === "/api/feedback/bug-reports") return "bug_report";
  if (path === "/api/announcements") return "read";
  if (path.startsWith("/api/voice/")) return "voice";
  return "general";
}

export interface RateLimits {
  /** Signed-in "general" requests per user per minute. */
  userPerMinute: number;
  /** Signed-out requests per IP per minute, for every bucket without its own limit. */
  ipPerMinute: number;
  /**
   * Every request from one address per minute, signed in or not. Sized for a shared NAT
   * (office, carrier) so it only trips on floods, never on one busy household.
   */
  ipTotalPerMinute: number;
  /** Sign-in, sign-up, code and OAuth requests per IP per minute. */
  authPerMinute: number;
  readPerMinute: number;
  streamPerMinute: number;
  sendPerMinute: number;
  artifactPerMinute: number;
  connectPerMinute: number;
  messagingPerMinute: number;
  voicePerMinute: number;
  bugReportsPerHour: number;
}

/**
 * Defaults sized for the native app: a launch fires ~60 list/get calls within a few seconds,
 * then several screens poll every 2-5 s (4 screens at 2 s is 120 a minute) while streams
 * reconnect after network changes. 600 general and 1200 read calls a minute leave several times
 * that headroom; a client stuck in a tight loop still hits them within seconds.
 */
export const DEFAULT_RATE_LIMITS: RateLimits = {
  userPerMinute: 600,
  ipPerMinute: 300,
  ipTotalPerMinute: 3000,
  authPerMinute: 60,
  readPerMinute: 1200,
  streamPerMinute: 240,
  sendPerMinute: 20,
  artifactPerMinute: 20,
  connectPerMinute: 20,
  messagingPerMinute: 20,
  voicePerMinute: 20,
  bugReportsPerHour: 10,
};

export function readRateLimits(env: NodeJS.ProcessEnv = process.env): RateLimits {
  const read = (raw: string | undefined, fallback: number) => {
    if (raw === undefined || raw.trim() === "") return fallback;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return fallback;
    return Math.floor(parsed);
  };
  const d = DEFAULT_RATE_LIMITS;
  return {
    userPerMinute: read(env.API_RATE_LIMIT_PER_MINUTE_USER, d.userPerMinute),
    ipPerMinute: read(env.API_RATE_LIMIT_PER_MINUTE_IP, d.ipPerMinute),
    ipTotalPerMinute: read(env.API_RATE_LIMIT_IP_TOTAL_PER_MINUTE, d.ipTotalPerMinute),
    authPerMinute: read(env.API_RATE_LIMIT_AUTH_PER_MINUTE, d.authPerMinute),
    readPerMinute: read(env.API_RATE_LIMIT_READ_PER_MINUTE, d.readPerMinute),
    streamPerMinute: read(env.API_RATE_LIMIT_STREAM_PER_MINUTE, d.streamPerMinute),
    sendPerMinute: read(env.API_RATE_LIMIT_SEND_PER_MINUTE, d.sendPerMinute),
    artifactPerMinute: read(env.API_RATE_LIMIT_ARTIFACTS_PER_MINUTE, d.artifactPerMinute),
    connectPerMinute: read(env.API_RATE_LIMIT_CONNECT_PER_MINUTE, d.connectPerMinute),
    messagingPerMinute: read(env.API_RATE_LIMIT_MESSAGING_PER_MINUTE, d.messagingPerMinute),
    voicePerMinute: read(env.API_RATE_LIMIT_VOICE_PER_MINUTE, d.voicePerMinute),
    bugReportsPerHour: read(env.API_RATE_LIMIT_BUG_REPORTS_PER_HOUR, d.bugReportsPerHour),
  };
}

export function bucketLimit(limits: RateLimits, bucket: RateBucket, signedIn: boolean): number {
  switch (bucket) {
    case "exempt":
      return 0;
    case "auth":
      return limits.authPerMinute;
    case "send":
      return limits.sendPerMinute;
    case "artifact":
      return limits.artifactPerMinute;
    case "connect":
      return limits.connectPerMinute;
    case "messaging":
      return limits.messagingPerMinute;
    case "voice":
      return limits.voicePerMinute;
    case "bug_report":
      return limits.bugReportsPerHour;
    case "read":
      return signedIn ? limits.readPerMinute : limits.ipPerMinute;
    case "stream":
      return signedIn ? limits.streamPerMinute : limits.ipPerMinute;
    case "general":
      return signedIn ? limits.userPerMinute : limits.ipPerMinute;
    default: {
      const unknown: never = bucket;
      throw new Error(`Unknown rate bucket ${String(unknown)}`);
    }
  }
}

export function bucketWindowMs(bucket: RateBucket): number {
  return bucket === "bug_report" ? BUG_REPORT_WINDOW_MS : RATE_WINDOW_MS;
}

export interface RateCheck {
  key: string;
  scope: "user" | "ip";
  limit: number;
  windowMs: number;
}

/**
 * The buckets one request counts against. Signed-in traffic is counted per account (wherever it
 * comes from) and also per address under a NAT-sized cap; auth and signed-out traffic per address.
 */
export function rateChecks(
  limits: RateLimits,
  bucket: RateBucket,
  userId: string | undefined,
  ip: string,
): RateCheck[] {
  const limit = bucketLimit(limits, bucket, Boolean(userId));
  if (limit <= 0) return [];
  const windowMs = bucketWindowMs(bucket);
  if (bucket === "auth" || !userId) {
    return [{ key: `${bucket}:ip:${ip}`, scope: "ip", limit, windowMs }];
  }
  const checks: RateCheck[] = [{ key: `${bucket}:user:${userId}`, scope: "user", limit, windowMs }];
  if (limits.ipTotalPerMinute > 0) {
    checks.push({
      key: `all:ip:${ip}`,
      scope: "ip",
      limit: limits.ipTotalPerMinute,
      windowMs: RATE_WINDOW_MS,
    });
  }
  return checks;
}

/**
 * True for the first rejected request in a window. Recording only that one keeps the security
 * log to a single row per user or address per window, however hard a client keeps retrying.
 */
export function isFirstRejection(count: number, limit: number): boolean {
  return limit > 0 && count === limit + 1;
}

export interface RateDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

/** `count` is the count after this request is included. 0 limit means unlimited. */
export function decideRate(
  count: number,
  limit: number,
  elapsedMs: number,
  windowMs = RATE_WINDOW_MS,
): RateDecision {
  if (limit <= 0) return { allowed: true, limit: 0, remaining: 0, retryAfterSeconds: 0 };
  const allowed = count <= limit;
  const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000));
  return {
    allowed,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds,
  };
}

export function rateWindowStart(now: number, windowMs = RATE_WINDOW_MS): number {
  return Math.floor(now / windowMs) * windowMs;
}

export class MemoryRateLedger {
  private counts = new Map<string, { window: number; count: number }>();

  take(key: string, now: number, limit: number, windowMs = RATE_WINDOW_MS): RateDecision {
    const window = rateWindowStart(now, windowMs);
    const current = this.counts.get(key);
    const count = current && current.window === window ? current.count + 1 : 1;
    this.counts.set(key, { window, count });
    return decideRate(count, limit, now - window, windowMs);
  }
}
