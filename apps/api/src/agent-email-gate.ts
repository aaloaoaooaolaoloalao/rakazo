import { ORPCError } from "@orpc/server";
import { EMAIL_VERIFICATION_REQUIRED, procedureRequiresVerifiedEmail } from "@rakazo/core";
import type { PrismaClient } from "@rakazo/db";
import { assertUserEmailVerifiedForAgents, EmailVerificationRequiredError } from "@rakazo/db";

/**
 * Refuses an agent-capability RPC for an account whose email is not verified, with a 403 whose
 * code the apps match. Other procedures, and routine updates that only pause, pass through.
 */
export async function assertAgentCapabilityAllowed(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  path: readonly string[],
  input: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!procedureRequiresVerifiedEmail(path, input)) return;
  try {
    await assertUserEmailVerifiedForAgents(prisma, userId, env);
  } catch (error) {
    if (error instanceof EmailVerificationRequiredError) {
      throw new ORPCError(EMAIL_VERIFICATION_REQUIRED, { status: 403, message: error.message });
    }
    throw error;
  }
}
