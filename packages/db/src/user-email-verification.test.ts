import { describe, expect, it, vi } from "vitest";
import {
  agentRunBlockedForUnverifiedEmail,
  assertUserEmailVerifiedForAgents,
} from "./user-email-verification.js";

const on = { REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: "true" };

function prismaWith(user: { emailVerified: boolean } | null | Error) {
  return {
    user: {
      findUnique: vi.fn(async () => {
        if (user instanceof Error) throw user;
        return user;
      }),
    },
  } as never as Parameters<typeof agentRunBlockedForUnverifiedEmail>[0] & {
    user: { findUnique: ReturnType<typeof vi.fn> };
  };
}

describe("agentRunBlockedForUnverifiedEmail", () => {
  it("never reads the account while the worker gate is off", async () => {
    const prisma = prismaWith({ emailVerified: false });
    expect(await agentRunBlockedForUnverifiedEmail(prisma, "u", {})).toBe(false);
    expect(
      await agentRunBlockedForUnverifiedEmail(prisma, "u", {
        EMAIL_PROVIDER: "resend",
        EMAIL_API_KEY: "k",
      }),
    ).toBe(false);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("blocks an unverified or missing account and passes a verified one", async () => {
    expect(
      await agentRunBlockedForUnverifiedEmail(prismaWith({ emailVerified: false }), "u", on),
    ).toBe(true);
    expect(await agentRunBlockedForUnverifiedEmail(prismaWith(null), "u", on)).toBe(true);
    const verified = prismaWith({ emailVerified: true });
    expect(await agentRunBlockedForUnverifiedEmail(verified, "u", on)).toBe(false);
    expect(verified.user.findUnique).toHaveBeenCalledWith({
      where: { id: "u" },
      select: { emailVerified: true },
    });
  });

  it("lets the run through when the lookup fails", async () => {
    expect(await agentRunBlockedForUnverifiedEmail(prismaWith(new Error("db down")), "u", on)).toBe(
      false,
    );
  });
});

describe("assertUserEmailVerifiedForAgents", () => {
  it("throws for an unverified account when the gate is on", async () => {
    await expect(
      assertUserEmailVerifiedForAgents(prismaWith({ emailVerified: false }), "u", on),
    ).rejects.toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED" });
    await expect(
      assertUserEmailVerifiedForAgents(prismaWith({ emailVerified: true }), "u", on),
    ).resolves.toBeUndefined();
  });
});
