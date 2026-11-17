import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecutorDeps } from "./executor-deps.js";
import { retryRoutineRun, wakeRoutine } from "./run-routines.js";

const scheduledAt = new Date("2026-11-17T08:00:00Z");

function fixture(options: { emailVerified: boolean; crons?: string[] }) {
  const routine = {
    id: "routine-1",
    botId: "bot-1",
    userId: "user-1",
    spaceId: "space-1",
    threadId: null,
    active: true,
    nextRunAt: scheduledAt,
    crons: options.crons ?? ["0 8 * * *"],
    timezone: "UTC",
    watch: null,
    prompt: "daily summary",
  };
  const prisma = {
    routine: {
      findUnique: vi.fn(async () => routine),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    bot: {
      findUnique: vi.fn(async () => ({
        id: "bot-1",
        archivedAt: null,
        thread: { id: "thread-1" },
      })),
    },
    user: { findUnique: vi.fn(async () => ({ emailVerified: options.emailVerified })) },
    run: {
      findUnique: vi.fn(async () => ({
        id: "run-0",
        routineId: "routine-1",
        trigger: "routine",
        status: "failed",
        retryOfRunId: null,
        userId: "user-1",
        createdAt: scheduledAt,
      })),
      findFirst: vi.fn(async () => null),
    },
    agentSkill: { findMany: vi.fn(async () => []) },
    $transaction: vi.fn(async () => Promise.reject(new Error("would create a run"))),
  };
  const jobs = { enqueue: vi.fn(async () => undefined), cancel: vi.fn(async () => undefined) };
  const deps = { prisma, jobs } as unknown as ExecutorDeps;
  return { prisma, jobs, deps };
}

describe("routines for an unverified owner", () => {
  beforeEach(() => {
    vi.stubEnv("REQUIRE_VERIFIED_EMAIL_FOR_AGENTS", "true");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T08:00:30Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("skips a recurring routine to its next occurrence without a run and keeps it active", async () => {
    const { prisma, jobs, deps } = fixture({ emailVerified: false });
    await wakeRoutine(deps, "routine-1", scheduledAt.toISOString());
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.routine.updateMany).toHaveBeenCalledOnce();
    const [{ where, data }] = prisma.routine.updateMany.mock.calls[0] as unknown as [
      { where: Record<string, unknown>; data: Record<string, unknown> },
    ];
    expect(where).toMatchObject({ id: "routine-1", active: true, nextRunAt: scheduledAt });
    expect(data).toEqual({ nextRunAt: new Date("2026-11-18T08:00:00Z") });
    expect(jobs.enqueue).toHaveBeenCalledOnce();
  });

  it("leaves a one-time routine due and untouched", async () => {
    const { prisma, jobs, deps } = fixture({
      emailVerified: false,
      crons: ["@once"],
    });
    await wakeRoutine(deps, "routine-1", scheduledAt.toISOString());
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.routine.updateMany).not.toHaveBeenCalled();
    expect(jobs.enqueue).not.toHaveBeenCalled();
  });

  it("fires a verified owner's routine as before", async () => {
    const { prisma, deps } = fixture({ emailVerified: true });
    await expect(wakeRoutine(deps, "routine-1", scheduledAt.toISOString())).rejects.toThrow(
      "would create a run",
    );
    expect(prisma.routine.updateMany).not.toHaveBeenCalled();
  });

  it("does not retry a failed routine run for an unverified owner", async () => {
    const { prisma, deps } = fixture({ emailVerified: false });
    await retryRoutineRun(deps, "run-0");
    expect(prisma.routine.findUnique).not.toHaveBeenCalled();
    expect(prisma.run.findFirst).not.toHaveBeenCalled();
  });
});
