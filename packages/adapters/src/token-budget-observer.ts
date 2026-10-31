import { randomUUID } from "node:crypto";
import type { ModelCallObserver } from "@rakazo/adapter-kit";
import {
  claimSize,
  PROVIDER_UNAVAILABLE_CODE,
  providerCircuit,
  readTokenLimits,
} from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { claimTokenBudget, releaseTokenHold } from "@rakazo/db";

type BudgetDb = Pick<PrismaClient, "$transaction" | "user" | "tokenBudgetHold" | "usageRecord">;

const calls = new Map<string, { count: number; started: number }>();
const holdByReservation = new Map<string, string>();

function modelCallCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MAX_MODEL_CALLS_PER_RUN?.trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function wallCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.RUN_WALL_MS?.trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function outputCap(requested: number, env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.MODEL_MAX_OUTPUT_TOKENS?.trim();
  if (!raw || raw === "0") return requested;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return requested;
  return Math.min(requested, Math.floor(parsed));
}

/** Check the shared user budget before every model call, including routines. */
export function withTokenBudget(
  prisma: BudgetDb,
  userId: string,
  inner: ModelCallObserver | undefined,
): ModelCallObserver {
  return {
    async beforeCall(call) {
      if (providerCircuit.isOpen()) throw new Error(PROVIDER_UNAVAILABLE_CODE);
      const runId = call.runId || "run";
      const state = calls.get(runId) ?? { count: 0, started: Date.now() };
      state.count += 1;
      calls.set(runId, state);
      const callsCap = modelCallCap();
      const wall = wallCap();
      if (
        (callsCap > 0 && state.count > callsCap) ||
        (wall > 0 && Date.now() - state.started > wall)
      ) {
        throw new Error("token_limit");
      }
      const callId = call.callId || randomUUID();
      const limits = readTokenLimits();
      if (limits.daily > 0 || limits.monthly > 0 || limits.perRun > 0) {
        await claimTokenBudget(prisma, {
          userId,
          runId,
          callId,
          tokens: claimSize(call.inputTokensEstimate, outputCap(call.maxOutputTokens)),
        });
      }
      if (!inner) return callId;
      try {
        const reservation = await inner.beforeCall({ ...call, callId });
        if (reservation !== callId) holdByReservation.set(reservation, callId);
        return reservation;
      } catch (error) {
        await releaseTokenHold(prisma, callId);
        throw error;
      }
    },
    async afterCall(reservationId, usage) {
      const holdId = holdByReservation.get(reservationId) ?? reservationId;
      holdByReservation.delete(reservationId);
      await releaseTokenHold(prisma, holdId).catch(() => undefined);
      await inner?.afterCall(reservationId, usage);
    },
    onRequestId: inner?.onRequestId,
  };
}
