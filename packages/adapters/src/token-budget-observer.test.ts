import { MemoryTokenLedger } from "@rakazo/core";
import { claimTokenBudget, releaseTokenHold } from "@rakazo/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTokenBudget } from "./token-budget-observer.js";

vi.mock("@rakazo/db", () => ({
  claimTokenBudget: vi.fn(),
  releaseTokenHold: vi.fn(),
}));

const limits = { daily: 1_000_000, monthly: 3_000_000, perRun: 250_000 };
const now = new Date("2026-10-27T12:00:00Z");

function installLedger() {
  const ledger = new MemoryTokenLedger();
  const holds = new Map<string, string>();
  vi.mocked(claimTokenBudget).mockImplementation(async (_prisma, input) => {
    const decision = await ledger.claim({
      userId: input.userId,
      runId: input.runId,
      tokens: input.tokens,
      limits,
      now,
      timeZone: "UTC",
    });
    if (!decision.ok || !decision.holdId) throw new Error("token_limit");
    holds.set(input.callId, decision.holdId);
  });
  vi.mocked(releaseTokenHold).mockImplementation(async (_prisma, callId) => {
    const holdId = holds.get(callId);
    if (holdId) ledger.settle(holdId, 3_000, now.getTime());
  });
  return ledger;
}

const call = {
  callId: "call-1",
  runId: "run-1",
  provider: "mistral",
  modelId: "mistral",
  operationKind: "answer" as const,
  inputTokensEstimate: 60_000,
  maxOutputTokens: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("token budget observer", () => {
  it("survives ten estimated calls when each hold is released down to real usage", async () => {
    installLedger();
    const observer = withTokenBudget({} as never, "user", undefined);
    for (let index = 0; index < 10; index += 1) {
      const id = await observer.beforeCall({ ...call, callId: `call-${index}` });
      await observer.afterCall(id, { inputTokens: 2_000, outputTokens: 1_000, costUsd: 0 });
    }
    expect(releaseTokenHold).toHaveBeenCalledTimes(10);
  });

  it("releases the hold when the inner observer throws", async () => {
    installLedger();
    const inner = {
      beforeCall: vi.fn(async () => {
        throw new Error("provider down");
      }),
      afterCall: vi.fn(),
    };
    const observer = withTokenBudget({} as never, "user", inner);
    await expect(observer.beforeCall(call)).rejects.toThrow("provider down");
    expect(releaseTokenHold).toHaveBeenCalledWith(expect.anything(), "call-1");
  });

  it("releases the budget hold when the inner observer returns a different id", async () => {
    installLedger();
    const inner = {
      beforeCall: vi.fn(async () => "credit-reservation"),
      afterCall: vi.fn(),
    };
    const observer = withTokenBudget({} as never, "user", inner);
    const reservation = await observer.beforeCall(call);
    expect(reservation).toBe("credit-reservation");
    await observer.afterCall(reservation, { inputTokens: 2_000, outputTokens: 1_000, costUsd: 0 });
    expect(releaseTokenHold).toHaveBeenCalledWith(expect.anything(), "call-1");
    expect(inner.afterCall).toHaveBeenCalledWith(
      "credit-reservation",
      expect.objectContaining({ inputTokens: 2_000 }),
    );
  });
});
