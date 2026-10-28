/** Stable code the client maps. The prose is not the signal. */
export const TOKEN_LIMIT_CODE = "token_limit";

/**
 * Parallel runs share one user budget. Claims are decided under a lock, and each admitted
 * call reserves its input estimate plus its output cap until the real usage row replaces
 * that reservation. Two claims cannot both pass when their sum would cross the cap.
 * The remaining overshoot is only the input-estimate error of a call already admitted
 * (the provider may count more input than we reserved). The output part of a claim is
 * capped at 25% of the per-run limit so a huge model max cannot block a run alone.
 */
export const TOKEN_BUDGET_OVERSHOOT =
  "One in-flight call may exceed its reserved input estimate. Output is reserved up front.";

export interface TokenLimits {
  /** 0 means unlimited. */
  daily: number;
  monthly: number;
  perRun: number;
}

export function parseTokenLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

export function readTokenLimits(env: NodeJS.ProcessEnv = process.env): TokenLimits {
  return {
    daily: parseTokenLimit(env.USER_TOKEN_LIMIT_DAILY, 1_000_000),
    monthly: parseTokenLimit(env.USER_TOKEN_LIMIT_MONTHLY, 3_000_000),
    perRun: parseTokenLimit(env.USER_TOKEN_LIMIT_PER_RUN, 250_000),
  };
}

export function tokenLimitExemptEmails(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set(
    (env.USER_TOKEN_LIMIT_EXEMPT_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );
}

export interface BudgetSnapshot {
  dayUsed: number;
  monthUsed: number;
  runUsed: number;
  dayReserved: number;
  monthReserved: number;
  runReserved: number;
}

export type BudgetDecision =
  | { ok: true }
  | { ok: false; code: typeof TOKEN_LIMIT_CODE; window: "day" | "month" | "run" };

export function decideBudget(
  limits: TokenLimits,
  snapshot: BudgetSnapshot,
  claim: number,
): BudgetDecision {
  const tokens = Math.max(0, Math.floor(claim));
  if (limits.perRun > 0 && snapshot.runUsed + snapshot.runReserved + tokens > limits.perRun) {
    return { ok: false, code: TOKEN_LIMIT_CODE, window: "run" };
  }
  if (limits.daily > 0 && snapshot.dayUsed + snapshot.dayReserved + tokens > limits.daily) {
    return { ok: false, code: TOKEN_LIMIT_CODE, window: "day" };
  }
  if (limits.monthly > 0 && snapshot.monthUsed + snapshot.monthReserved + tokens > limits.monthly) {
    return { ok: false, code: TOKEN_LIMIT_CODE, window: "month" };
  }
  return { ok: true };
}

export function claimSize(
  inputTokensEstimate: number,
  maxOutputTokens: number,
  limits: TokenLimits = readTokenLimits(),
): number {
  const cap = limits.perRun;
  const output = Math.max(0, Math.floor(maxOutputTokens));
  const outputCeiling = cap > 0 ? Math.floor(cap * 0.25) : output;
  const bounded = cap > 0 ? Math.min(output, outputCeiling) : output;
  return Math.max(0, Math.floor(inputTokensEstimate)) + bounded;
}

function zonedOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    pick("year"),
    pick("month") - 1,
    pick("day"),
    pick("hour"),
    pick("minute"),
    pick("second"),
  );
  return asUtc - instant.getTime();
}

/** Start of the calendar day and the next midnight in `timeZone` (UTC when the zone is invalid). */
export function dayWindow(now: Date, timeZone: string): { start: Date; resetsAt: Date } {
  const zone = safeZone(timeZone);
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const utcMidnight = new Date(`${date}T00:00:00.000Z`);
  const start = new Date(utcMidnight.getTime() - zonedOffsetMs(utcMidnight, zone));
  const next = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const nextDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(next);
  const nextUtc = new Date(`${nextDate}T00:00:00.000Z`);
  return { start, resetsAt: new Date(nextUtc.getTime() - zonedOffsetMs(nextUtc, zone)) };
}

export function monthWindow(now: Date, timeZone: string): { start: Date; resetsAt: Date } {
  const zone = safeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const utc = new Date(Date.UTC(year, month - 1, 1));
  const start = new Date(utc.getTime() - zonedOffsetMs(utc, zone));
  const nextUtc = new Date(Date.UTC(year, month, 1));
  return { start, resetsAt: new Date(nextUtc.getTime() - zonedOffsetMs(nextUtc, zone)) };
}

function safeZone(timeZone: string): string {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

export interface LedgerUsage {
  userId: string;
  runId: string;
  tokens: number;
  at: number;
}

export interface LedgerHold {
  id: string;
  userId: string;
  runId: string;
  tokens: number;
  at: number;
}

/** In-memory stand-in for the database lock. Claims run one at a time per process. */
export class MemoryTokenLedger {
  usage: LedgerUsage[] = [];
  holds: LedgerHold[] = [];
  private tail: Promise<unknown> = Promise.resolve();

  claim(input: {
    userId: string;
    runId: string;
    tokens: number;
    limits: TokenLimits;
    now: Date;
    timeZone: string;
    exempt?: boolean;
  }): Promise<BudgetDecision & { holdId?: string }> {
    const run = this.tail.then(() => this.claimLocked(input));
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private claimLocked(input: {
    userId: string;
    runId: string;
    tokens: number;
    limits: TokenLimits;
    now: Date;
    timeZone: string;
    exempt?: boolean;
  }): BudgetDecision & { holdId?: string } {
    if (input.exempt || input.tokens <= 0) return { ok: true };
    const decision = decideBudget(input.limits, this.snapshot(input), input.tokens);
    if (!decision.ok) return decision;
    const holdId = `hold-${this.holds.length + 1}`;
    this.holds.push({
      id: holdId,
      userId: input.userId,
      runId: input.runId,
      tokens: input.tokens,
      at: input.now.getTime(),
    });
    return { ok: true, holdId };
  }

  settle(holdId: string, actualTokens: number, at: number) {
    const hold = this.holds.find((row) => row.id === holdId);
    if (!hold) return;
    this.holds = this.holds.filter((row) => row.id !== holdId);
    this.usage.push({
      userId: hold.userId,
      runId: hold.runId,
      tokens: actualTokens,
      at,
    });
  }

  snapshot(input: { userId: string; runId: string; now: Date; timeZone: string }): BudgetSnapshot {
    const day = dayWindow(input.now, input.timeZone).start.getTime();
    const month = monthWindow(input.now, input.timeZone).start.getTime();
    const sum = (
      rows: Array<{ userId: string; runId?: string; tokens: number; at: number }>,
      since: number,
      runId?: string,
    ) =>
      rows
        .filter(
          (row) =>
            row.userId === input.userId &&
            row.at >= since &&
            (runId === undefined || row.runId === runId),
        )
        .reduce((total, row) => total + row.tokens, 0);
    return {
      dayUsed: sum(this.usage, day),
      monthUsed: sum(this.usage, month),
      runUsed: sum(this.usage, 0, input.runId),
      dayReserved: sum(this.holds, day),
      monthReserved: sum(this.holds, month),
      runReserved: sum(this.holds, 0, input.runId),
    };
  }
}
