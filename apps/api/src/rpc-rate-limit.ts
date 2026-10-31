import type { Context } from "hono";
import {
  RATE_LIMITED_CODE,
  bucketLimit,
  decideRate,
  rateBucket,
  readRateLimits,
} from "@rakazo/core";
import { recordSecurityEvent, takeRateBucket } from "@rakazo/db";
import type { PrismaClient } from "@rakazo/db";
import { requestClientIp } from "./client-ip.js";

type RateDb = Pick<PrismaClient, "apiRateBucket">;

/** Postgres-backed so a restart or a second API process keeps the same window. */
export async function limitRpc(
  c: Context,
  prisma: RateDb,
  userId: string | undefined,
): Promise<Response | null> {
  const bucket = rateBucket(new URL(c.req.url).pathname);
  const limits = readRateLimits();
  const limit = bucketLimit(limits, bucket, Boolean(userId));
  if (limit <= 0) return null;
  const ip = requestClientIp(c) ?? "unknown";
  const key = `${bucket}:${userId ? `user:${userId}` : `ip:${ip}`}`;
  let count = 1;
  try {
    count = await takeRateBucket(prisma, key);
  } catch {
    return null;
  }
  const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
  const decision = decideRate(count, limit, Date.now() - windowStart);
  if (decision.allowed) return null;
  await recordSecurityEvent({
    type: "rate_limit.hit",
    userId: userId ?? null,
    ip,
    metadata: { bucket },
  });
  return c.json(
    { json: { code: RATE_LIMITED_CODE, status: 429, message: RATE_LIMITED_CODE } },
    429,
    { "retry-after": String(decision.retryAfterSeconds) },
  );
}
