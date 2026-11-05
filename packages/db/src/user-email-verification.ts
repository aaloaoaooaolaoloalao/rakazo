import {
  agentsRequireVerifiedEmail,
  EmailVerificationRequiredError,
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
