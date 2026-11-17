import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as ComputerLifecycleModule from "./computer-lifecycle.js";
import { createRunExecutor } from "./executor.js";
import type * as RunLifecycleModule from "./run-lifecycle.js";

const mocks = vi.hoisted(() => ({
  acquire: vi.fn(),
  failRunBeforeTurn: vi.fn(),
}));

vi.mock("./computer-lifecycle.js", async (importOriginal) => ({
  ...(await importOriginal<typeof ComputerLifecycleModule>()),
  acquireComputerExecutionLease: mocks.acquire,
}));

vi.mock("./run-lifecycle.js", async (importOriginal) => ({
  ...(await importOriginal<typeof RunLifecycleModule>()),
  failRunBeforeTurn: mocks.failRunBeforeTurn,
}));

function fixture(emailVerified: boolean) {
  const run = {
    id: "run-1",
    botId: "bot-1",
    userId: "user-1",
    spaceId: "space-1",
    threadId: "thread-1",
    taskId: "task-1",
    trigger: "webhook",
    status: "queued",
    leaseFence: 0,
    checkpoint: null,
    startedAt: null,
  };
  const prisma = {
    run: {
      findUnique: vi.fn(async () => run),
      findUniqueOrThrow: vi.fn(async () => ({ ...run, status: "leased" })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: vi.fn(async () => ({ emailVerified })) },
    bot: {
      findUnique: vi.fn(async () => ({ name: "Helper" })),
      // Reached only by a run the gate lets through; stop there.
      findUniqueOrThrow: vi.fn(async () => Promise.reject(new Error("past the gate"))),
    },
    attempt: { create: vi.fn(async () => ({ id: "attempt-1" })) },
  };
  const executor = createRunExecutor({
    prisma,
    jobs: { enqueue: vi.fn(async () => undefined) },
  } as unknown as Parameters<typeof createRunExecutor>[0]);
  return { prisma, start: () => executor.continueRun("run-1", "worker-1") };
}

describe("worker email verification gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.failRunBeforeTurn.mockResolvedValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails an unverified owner's run before touching a computer or model", async () => {
    vi.stubEnv("REQUIRE_VERIFIED_EMAIL_FOR_AGENTS", "true");
    const { prisma, start } = fixture(false);
    await start();
    expect(prisma.user.findUnique).toHaveBeenCalledOnce();
    expect(mocks.failRunBeforeTurn).toHaveBeenCalledOnce();
    const [, failedRun, botName, lease, message] = mocks.failRunBeforeTurn.mock.calls[0]!;
    expect(failedRun).toMatchObject({ id: "run-1", userId: "user-1" });
    expect(botName).toBe("Helper");
    expect(lease).toEqual({ attemptId: "attempt-1", workerId: "worker-1", fence: 1 });
    expect(message).toMatch(/^EMAIL_VERIFICATION_REQUIRED:/);
    expect(prisma.bot.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });

  it("runs a verified owner's run as before", async () => {
    vi.stubEnv("REQUIRE_VERIFIED_EMAIL_FOR_AGENTS", "true");
    const { prisma, start } = fixture(true);
    await expect(start()).rejects.toThrow("past the gate");
    expect(mocks.failRunBeforeTurn).not.toHaveBeenCalled();
    expect(prisma.attempt.create).not.toHaveBeenCalled();
  });

  it.each([undefined, "false"])(
    "does not look the owner up while the worker flag is %s",
    async (flag) => {
      if (flag !== undefined) vi.stubEnv("REQUIRE_VERIFIED_EMAIL_FOR_AGENTS", flag);
      else vi.stubEnv("REQUIRE_VERIFIED_EMAIL_FOR_AGENTS", undefined as unknown as string);
      vi.stubEnv("EMAIL_PROVIDER", "resend");
      const { prisma, start } = fixture(false);
      await expect(start()).rejects.toThrow("past the gate");
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(mocks.failRunBeforeTurn).not.toHaveBeenCalled();
    },
  );
});
