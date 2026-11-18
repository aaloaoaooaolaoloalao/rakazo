import type { TransactionalEmailProvider } from "@rakazo/adapter-kit";
import { configuredEmailProvider as providerFor } from "@rakazo/adapters";
import type { AppEnv } from "../env.js";

/** Sender used with Resend when EMAIL_FROM is unset. */
export const DEFAULT_RESEND_FROM = "SparkAI <no-reply@homesserver.work>";

export function configuredEmailProvider(
  env: Pick<AppEnv, "emailProvider" | "emailApiKey" | "emailFrom" | "emailReplyTo" | "smtpUrl">,
): TransactionalEmailProvider | undefined {
  // Preserve existing SMTP deployments when no provider is selected explicitly.
  // A Resend key alone selects Resend, like SMTP_URL alone selects SMTP.
  const provider =
    env.emailProvider ?? (env.smtpUrl ? "smtp" : env.emailApiKey ? "resend" : "none");
  return providerFor({
    provider,
    apiKey: env.emailApiKey,
    from: provider === "resend" ? (env.emailFrom ?? DEFAULT_RESEND_FROM) : env.emailFrom,
    replyTo: env.emailReplyTo,
    smtpUrl: env.smtpUrl,
  });
}
