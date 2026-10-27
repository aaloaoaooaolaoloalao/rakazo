import {
  TOKEN_LIMIT_CODE,
  type BudgetDecision,
  type TokenLimits,
  dayWindow,
  decideBudget,
  monthWindow,
  readTokenLimits,
  tokenLimitExemptEmails,
} from "@rakazo/core";
import type { Prisma, PrismaClient } from "./generated/prisma/client.js";
import { runAsSystem } from "./row-security.js";
import { recordSecurityEvent } from "./security-events.js";

type BudgetDb = Pick<PrismaClient, "$transaction" | "user" | "usageRecord">;

export class TokenLimitError extends Error {
  readonly code = TOKEN_LIMIT_CODE;
  constructor(readonly window: "day" | "month" | "run") {
    super(TOKEN_LIMIT_CODE);
  }
}

const HOLD_TTL_MS = 15 * 60_000;

export async function userTokenStatus(
  prisma: BudgetDb,
  userId: string,
  now = new Date(),
) {
  const limits = readTokenLimits();
  const zone = await timeZoneOf(prisma, userId);
  const day = dayWindow(now, zone);
  const month = monthWindow(now, zone);
  const totals = await totalsFor(prisma, userId, day.start, month.start, null);
  return {
    day: {
      used: totals.day,
      limit: limits.daily > 0 ? limits.daily : null,
      resetsAt: day.resetsAt.toISOString(),
    },
    month: {
      used: totals.month,
      limit: limits.monthly > 0 ? limits.monthly : null,
      resetsAt: month.resetsAt.toISOString(),
    },
    perRun: limits.perRun > 0 ? limits.perRun : null,
  };
}

export async function claimTokenBudget(
  prisma: BudgetDb,
  input: {
    userId: string;
    runId: string;
    callId: string;
    tokens: number;
    now?: Date;
  },
): Promise<void> {
  const limits = readTokenLimits();
  if (limits.daily === 0 && limits.monthly === 0 && limits.perRun === 0) return;
  const now = input.now ?? new Date();
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, timezone: true },
  });
  if (user?.email && tokenLimitExemptEmails().has(user.email.toLowerCase())) return;
  const zone = user?.timezone || "UTC";
  const decision = await reserve(prisma, input, limits, zone, now);
  if (decision.ok) return;
  await recordSecurityEvent({
    type: "budget.token_limit",
    userId: input.userId,
    metadata: { window: decision.window, runId: input.runId },
  });
  throw new TokenLimitError(decision.window);
}

async function reserve(
  prisma: BudgetDb,
  input: { userId: string; runId: string; callId: string; tokens: number },
  limits: TokenLimits,
  zone: string,
  now: Date,
): Promise<BudgetDecision> {
  return runAsSystem("claim a token budget", () =>
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.userId}, 41))`;
      const stale = new Date(now.getTime() - HOLD_TTL_MS);
      await tx.tokenBudgetHold.deleteMany({ where: { createdAt: { lt: stale } } });
      const day = dayWindow(now, zone);
      const month = monthWindow(now, zone);
      const [dayUsage, monthUsage, runUsage, dayHold, monthHold, runHold] = await Promise.all([
        spent(tx, input.userId, day.start, undefined),
        spent(tx, input.userId, month.start, undefined),
        spent(tx, input.userId, new Date(0), input.runId),
        reserved(tx, input.userId, day.start, undefined),
        reserved(tx, input.userId, month.start, undefined),
        reserved(tx, input.userId, new Date(0), input.runId),
      ]);
      const decision = decideBudget(
        limits,
        {
          dayUsed: dayUsage,
          monthUsed: monthUsage,
          runUsed: runUsage,
          dayReserved: dayHold,
          monthReserved: monthHold,
          runReserved: runHold,
        },
        input.tokens,
      );
      if (!decision.ok) return decision;
      await tx.tokenBudgetHold.create({
        data: {
          userId: input.userId,
          runId: input.runId,
          callId: input.callId,
          tokens: Math.max(0, Math.floor(input.tokens)),
        },
      });
      return { ok: true } as const;
    }),
  );
}

export async function releaseTokenHold(prisma: Pick<PrismaClient, "tokenBudgetHold">, callId: string) {
  await runAsSystem("release a token hold", () =>
    prisma.tokenBudgetHold.deleteMany({ where: { callId } }),
  );
}

async function timeZoneOf(prisma: BudgetDb, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  return user?.timezone || "UTC";
}

async function totalsFor(
  prisma: BudgetDb,
  userId: string,
  dayStart: Date,
  monthStart: Date,
  runId: string | null,
) {
  return runAsSystem("read a token budget", async () => {
    const day = await spent(prisma, userId, dayStart, undefined);
    const month = await spent(prisma, userId, monthStart, undefined);
    void runId;
    return { day, month };
  });
}

type Tx = Prisma.TransactionClient;

async function spent(
  tx: Pick<Prisma.TransactionClient, "usageRecord">,
  userId: string,
  since: Date,
  runId: string | undefined,
) {
  const row = await tx.usageRecord.aggregate({
    where: { userId, ...(runId ? { runId } : {}), createdAt: { gte: since } },
    _sum: { inputTokens: true, outputTokens: true },
  });
  return (row._sum.inputTokens ?? 0) + (row._sum.outputTokens ?? 0);
}

async function reserved(
  tx: Pick<Prisma.TransactionClient, "tokenBudgetHold">,
  userId: string,
  since: Date,
  runId: string | undefined,
) {
  const row = await tx.tokenBudgetHold.aggregate({
    where: { userId, ...(runId ? { runId } : {}), createdAt: { gte: since } },
    _sum: { tokens: true },
  });
  return row._sum.tokens ?? 0;
}
