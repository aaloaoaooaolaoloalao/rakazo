import { ORPCError } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import { assertAgentCapabilityAllowed } from "./agent-email-gate.js";

const on = { REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: "true" };
const prisma = (emailVerified: boolean) =>
  ({ user: { findUnique: vi.fn(async () => ({ emailVerified })) } }) as never;

describe("assertAgentCapabilityAllowed", () => {
  it("refuses an unverified account with a 403 EMAIL_VERIFICATION_REQUIRED", async () => {
    const error = await assertAgentCapabilityAllowed(
      prisma(false),
      "u",
      ["threads", "followUp"],
      {},
      on,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ORPCError);
    expect(error).toMatchObject({ code: "EMAIL_VERIFICATION_REQUIRED", status: 403 });
  });

  it("allows verified accounts, open procedures, routine pauses, and a disabled gate", async () => {
    await expect(
      assertAgentCapabilityAllowed(prisma(true), "u", ["threads", "send"], {}, on),
    ).resolves.toBeUndefined();
    await expect(
      assertAgentCapabilityAllowed(prisma(false), "u", ["routines", "remove"], {}, on),
    ).resolves.toBeUndefined();
    await expect(
      assertAgentCapabilityAllowed(
        prisma(false),
        "u",
        ["routines", "update"],
        { routineId: "r", active: false },
        on,
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertAgentCapabilityAllowed(
        prisma(false),
        "u",
        ["threads", "send"],
        {},
        {
          REQUIRE_VERIFIED_EMAIL_FOR_AGENTS: "false",
        },
      ),
    ).resolves.toBeUndefined();
  });
});
