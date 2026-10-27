/** Idempotency key for the default bot created at sign-up / first login backfill. */
export const AUTO_PROVISION_DEFAULT_BOT_SPAWN_KEY = "auto-provision:default";

export type AutoProvisionEnv = NodeJS.ProcessEnv;

/** Default on; set AUTO_PROVISION_NEW_USERS=false to disable. */
export function autoProvisionNewUsersEnabled(env: AutoProvisionEnv = process.env): boolean {
  return env.AUTO_PROVISION_NEW_USERS !== "false";
}

export function autoProvisionDefaultBotName(env: AutoProvisionEnv = process.env): string {
  const name = env.AUTO_PROVISION_DEFAULT_BOT_NAME?.trim();
  return name || "העוזר שלי";
}

/** Soft cap checked before auto-provision creates a new computer-backed bot. Default 1. */
export function autoProvisionMaxComputersPerUser(env: AutoProvisionEnv = process.env): number {
  const raw = env.AUTO_PROVISION_MAX_COMPUTERS_PER_USER;
  if (raw === undefined || raw.trim() === "") return 1;
  const limit = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(limit) || limit < 0) return 1;
  return limit;
}
