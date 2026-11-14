import {
  decideRate,
  isFirstRejection,
  RATE_LIMITED_CODE,
  rateBucket,
  rateChecks,
  rateWindowStart,
  readRateLimits,
} from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { recordSecurityEvent, takeRateBucket } from "@rakazo/db";
import type { Context } from "hono";
import { requestClientIp } from "./client-ip.js";

type RateDb = Pick<PrismaClient, "apiRateBucket">;

/**
 * Postgres-backed so a restart or a second API process keeps the same window. A request counts
 * against its account bucket and its address bucket; the first one over its limit answers 429.
 */
export async function limitRpc(
  c: Context,
  prisma: RateDb,
  userId: string | undefined,
): Promise<Response | null> {
  const bucket = rateBucket(new URL(c.req.url).pathname);
  const ip = requestClientIp(c) ?? "unknown";
  const checks = rateChecks(readRateLimits(), bucket, userId, ip);
  for (const check of checks) {
    let count = 1;
    const now = Date.now();
    try {
      count = await takeRateBucket(prisma, check.key, new Date(now), check.windowMs);
    } catch {
      continue;
    }
    const windowStart = rateWindowStart(now, check.windowMs);
    const decision = decideRate(count, check.limit, now - windowStart, check.windowMs);
    if (decision.allowed) continue;
    if (isFirstRejection(count, check.limit)) {
      await recordSecurityEvent({
        type: "rate_limit.hit",
        userId: userId ?? null,
        ip,
        metadata: {
          bucket,
          scope: check.scope,
          limit: check.limit,
          windowStart: new Date(windowStart).toISOString(),
          windowSeconds: check.windowMs / 1000,
        },
      });
    }
    return c.json(
      { json: { code: RATE_LIMITED_CODE, status: 429, message: RATE_LIMITED_CODE } },
      429,
      {
        "retry-after": String(decision.retryAfterSeconds),
        "x-ratelimit-limit": String(decision.limit),
        "x-ratelimit-remaining": "0",
      },
    );
  }
  return null;
}
