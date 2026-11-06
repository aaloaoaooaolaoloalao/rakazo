export const EMAIL_VERIFICATION_REQUIRED = "EMAIL_VERIFICATION_REQUIRED";

/** Whether this deployment can send mailbox verification (see apps/api email wiring). */
export function transactionalEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== "none") return true;
  if (env.SMTP_URL?.trim()) return true;
  if (env.EMAIL_API_KEY?.trim()) return true;
  return false;
}

/**
 * When true, starting agent runs, creating bots/computers, and auto-provision require
 * `user.emailVerified`. Off when email is not configured (typical local dev) unless forced on.
 */
export function agentsRequireVerifiedEmail(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.REQUIRE_VERIFIED_EMAIL_FOR_AGENTS?.trim().toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return transactionalEmailConfigured(env);
}

/** RPC paths that start runs, create bots, or boot computers. */
export const AGENT_CAPABILITY_PROCEDURES = new Set([
  "threads.send",
  "threads.sendWithRoutines",
  "threads.answer",
  "threads.voiceTranscript",
  "bots.create",
  "bots.importCreate",
  "bots.duplicate",
  "bots.restore",
  "routines.testRun",
  "computer.boot",
  "computer.recover",
]);

export function procedureRequiresVerifiedEmail(path: readonly string[]): boolean {
  return AGENT_CAPABILITY_PROCEDURES.has(path.join("."));
}

export class EmailVerificationRequiredError extends Error {
  readonly code = EMAIL_VERIFICATION_REQUIRED;

  constructor() {
    super("Email verification required");
    this.name = "EmailVerificationRequiredError";
  }
}
