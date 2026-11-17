import type { TransactionalEmail } from "@rakazo/adapter-kit";
import type { PrismaClient } from "@rakazo/db";
import { takeRateBucket } from "@rakazo/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

export const SEND_EMAIL_CODE_PATH = "/email-otp/send-verification-otp";
export const VERIFY_EMAIL_CODE_PATH = "/email-otp/verify-email";

/** One emailed code per address per minute, whatever the code is for. */
export const EMAIL_CODE_COOLDOWN_SECONDS = 60;
export const EMAIL_CODE_COOLDOWN_CODE = "OTP_RESEND_COOLDOWN";

const BRAND = "SparkAI";

export function emailCodeCooldownKey(email: string): string {
  return `email-code:${email.trim().toLowerCase()}`;
}

/**
 * Takes this minute's send slot for `email`. True when the slot was free. Counted per address
 * whether or not an account exists, so the answer never reveals which addresses are registered.
 * A storage failure lets the send through: the per-IP and per-email limits still apply.
 */
export async function takeEmailCodeSlot(
  prisma: Pick<PrismaClient, "apiRateBucket">,
  email: string,
  now = new Date(),
): Promise<boolean> {
  try {
    const count = await takeRateBucket(
      prisma,
      emailCodeCooldownKey(email),
      now,
      EMAIL_CODE_COOLDOWN_SECONDS * 1000,
    );
    return count <= 1;
  } catch {
    return true;
  }
}

function emailOf(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("email" in body)) return undefined;
  const email = (body as { email?: unknown }).email;
  if (typeof email !== "string") return undefined;
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : undefined;
}

/** Refuses a second code request for one address inside the cooldown with a 429 the app can read. */
export function emailCodeCooldown(prisma: Pick<PrismaClient, "apiRateBucket">): BetterAuthPlugin {
  return {
    id: "email-code-cooldown",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === SEND_EMAIL_CODE_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const email = emailOf(ctx.body);
            if (!email) return;
            if (await takeEmailCodeSlot(prisma, email)) return;
            throw new APIError(
              "TOO_MANY_REQUESTS",
              {
                code: EMAIL_CODE_COOLDOWN_CODE,
                message: "Wait a minute before asking for another code.",
                retryAfter: EMAIL_CODE_COOLDOWN_SECONDS,
              },
              { "retry-after": String(EMAIL_CODE_COOLDOWN_SECONDS) },
            );
          }),
        },
      ],
    },
  };
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char,
  );
}

/** A short Hebrew + English email with the 6-digit code that verifies a new address. */
export function verificationCodeEmail(
  email: string,
  code: string,
  expiresInMinutes = 10,
): TransactionalEmail {
  const shown = escapeHtml(code);
  const subject = `קוד האימות שלך ל-${BRAND} | Your ${BRAND} verification code`;
  const text = [
    `קוד האימות שלך ל-${BRAND}: ${code}`,
    `הקוד תקף ל-${expiresInMinutes} דקות. אם לא נרשמת, אפשר להתעלם מהמייל הזה.`,
    "",
    `Your ${BRAND} verification code: ${code}`,
    `It expires in ${expiresInMinutes} minutes. If you did not sign up, ignore this email.`,
  ].join("\n");
  const codeStyle =
    "font-size:32px;font-weight:700;letter-spacing:6px;font-family:Menlo,Consolas,monospace;margin:12px 0;";
  const html = `<!doctype html>
<html lang="he">
<head><meta charset="utf-8"><meta name="color-scheme" content="light dark"></head>
<body style="margin:0;padding:32px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#18181b;">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px 28px;">
<p style="font-size:20px;font-weight:600;margin:0 0 20px;">${BRAND}</p>
<div dir="rtl" style="text-align:right;">
<p style="margin:0;">קוד האימות שלך:</p>
<p dir="ltr" style="${codeStyle}text-align:right;">${shown}</p>
<p style="margin:0;color:#52525b;">הקוד תקף ל-${expiresInMinutes} דקות. אם לא נרשמת, אפשר להתעלם מהמייל הזה.</p>
</div>
<hr style="border:none;border-top:1px solid #e4e4e7;margin:24px 0;">
<div dir="ltr" style="text-align:left;">
<p style="margin:0;">Your verification code:</p>
<p style="${codeStyle}">${shown}</p>
<p style="margin:0;color:#52525b;">It expires in ${expiresInMinutes} minutes. If you did not sign up, ignore this email.</p>
</div>
</div>
</body>
</html>`;
  return { to: email, subject, html, text };
}
