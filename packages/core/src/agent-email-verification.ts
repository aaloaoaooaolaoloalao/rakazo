export const EMAIL_VERIFICATION_REQUIRED = "EMAIL_VERIFICATION_REQUIRED";

/** Whether this deployment can send mailbox verification (see apps/api email wiring). */
export function transactionalEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  const provider = env.EMAIL_PROVIDER?.trim().toLowerCase();
  if (provider && provider !== "none") return true;
  if (env.SMTP_URL?.trim()) return true;
  if (env.EMAIL_API_KEY?.trim() || env.RESEND_API_KEY?.trim()) return true;
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

/**
 * The worker's gate. Only an explicit REQUIRE_VERIFIED_EMAIL_FOR_AGENTS=true (or 1) turns it on:
 * the worker carries no email settings, so it never infers the gate from them.
 */
export function workerAgentsRequireVerifiedEmail(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = env.REQUIRE_VERIFIED_EMAIL_FOR_AGENTS?.trim().toLowerCase();
  return flag === "true" || flag === "1";
}

/** The run error a gated run ends with; starts with the code so clients can match it. */
export const EMAIL_VERIFICATION_REQUIRED_RUN_ERROR = `${EMAIL_VERIFICATION_REQUIRED}: Verify your email address to run agents.`;

/** RPC paths that start runs, create bots or automations, or boot or drive computers. */
export const AGENT_CAPABILITY_PROCEDURES = new Set([
  "threads.send",
  "threads.sendWithRoutines",
  "threads.answer",
  "threads.voiceTranscript",
  "threads.followUp",
  "threads.react",
  "bots.create",
  "bots.importCreate",
  "bots.duplicate",
  "bots.restore",
  "bots.setComputer",
  "groups.create",
  "groups.duplicate",
  "routines.create",
  "routines.update",
  "routines.testRun",
  "skills.start",
  "mcp.assignments.approve",
  "computer.boot",
  "computer.recover",
  "computer.takeover",
  "computer.input",
]);

/** Keys a routines.update may carry and still only turn things off. */
const ROUTINE_OFF_SWITCHES: Record<string, unknown> = {
  active: false,
  webhookEnabled: false,
  githubEnabled: false,
};

/** A routine update that only pauses it or turns its triggers off; an unverified owner may. */
export function isRoutineTurnOffOnly(input: unknown): boolean {
  if (!input || typeof input !== "object") return false;
  const entries = Object.entries(input).filter(
    ([key, value]) => key !== "routineId" && value !== undefined,
  );
  return (
    entries.length > 0 &&
    entries.every(
      ([key, value]) => key in ROUTINE_OFF_SWITCHES && ROUTINE_OFF_SWITCHES[key] === value,
    )
  );
}

export function procedureRequiresVerifiedEmail(path: readonly string[], input?: unknown): boolean {
  const name = path.join(".");
  if (!AGENT_CAPABILITY_PROCEDURES.has(name)) return false;
  // Pausing stays open so someone can always stop their own automations.
  if (name === "routines.update" && isRoutineTurnOffOnly(input)) return false;
  return true;
}

export class EmailVerificationRequiredError extends Error {
  readonly code = EMAIL_VERIFICATION_REQUIRED;

  constructor() {
    super("Email verification required");
    this.name = "EmailVerificationRequiredError";
  }
}
