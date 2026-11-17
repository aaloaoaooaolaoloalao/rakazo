import {
  agentsRequireVerifiedEmail,
  EmailVerificationRequiredError,
  workerAgentsRequireVerifiedEmail,
} from "@rakazo/core";
import type { PrismaClient } from "./client.js";

export { EmailVerificationRequiredError };

export async function assertUserEmailVerifiedForAgents(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!agentsRequireVerifiedEmail(env)) return;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true },
  });
  if (user?.emailVerified === true) return;
  throw new EmailVerificationRequiredError();
}

/**
 * Whether the worker must refuse to run agents for `userId`: the explicit worker gate is on and
 * the account's email is not verified. One primary-key read; Apple and verified accounts pass.
 * A failed lookup lets the run through, so a database blip never fails every run.
 */
export async function agentRunBlockedForUnverifiedEmail(
  prisma: Pick<PrismaClient, "user">,
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!workerAgentsRequireVerifiedEmail(env)) return false;
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    return user?.emailVerified !== true;
  } catch {
    return false;
  }
}
