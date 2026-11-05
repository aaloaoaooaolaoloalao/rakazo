import type { PrismaClient } from "@rakazo/db";
import {
  authCredentialEmailRetryAfterSeconds,
  takeAuthCredentialEmailBucket,
} from "@rakazo/db";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

/** Keep in sync with packages/db/src/auth-email-rate-bucket.ts */
const AUTH_CREDENTIAL_EMAIL_WINDOW_MS = 15 * 60_000;

const CREDENTIAL_EMAIL_PATHS = new Set([
  "/sign-in/email",
  "/sign-up/email",
  "/request-password-reset",
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
]);

function normalizeEmail(body: unknown): string | undefined {
  if (!body || typeof body !== "object" || !("email" in body)) return undefined;
  const email = (body as { email?: unknown }).email;
  if (typeof email !== "string") return undefined;
  const trimmed = email.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : undefined;
}

/**
 * Per-email credential rate limit alongside Better Auth's per-IP table limit.
 * Uses the same 10 / 15 minutes window; lockout clears when the window rolls.
 */
export function credentialEmailRateLimit(prisma: PrismaClient): BetterAuthPlugin {
  return {
    id: "credential-email-rate-limit",
    hooks: {
      before: [
        {
          matcher: (ctx) => CREDENTIAL_EMAIL_PATHS.has(ctx.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const email = normalizeEmail(ctx.body);
            if (!email) return;
            const now = Date.now();
            const windowStart =
              Math.floor(now / AUTH_CREDENTIAL_EMAIL_WINDOW_MS) * AUTH_CREDENTIAL_EMAIL_WINDOW_MS;
            const count = await takeAuthCredentialEmailBucket(prisma, email, now);
            const retryAfter = authCredentialEmailRetryAfterSeconds(count, now - windowStart);
            if (retryAfter === null) return;
            throw new APIError("TOO_MANY_REQUESTS", {
              message: "Too many attempts. Try again later.",
              code: "TOO_MANY_REQUESTS",
            });
          }),
        },
      ],
    },
  };
}
