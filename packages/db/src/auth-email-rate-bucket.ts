import type { PrismaClient } from "./client.js";
import { runAsSystem } from "./row-security.js";

type RateDb = Pick<PrismaClient, "apiRateBucket">;

/** Matches Better Auth credential routes: 10 attempts per 15 minutes per normalized email. */
export const AUTH_CREDENTIAL_EMAIL_WINDOW_MS = 15 * 60_000;
export const AUTH_CREDENTIAL_EMAIL_MAX = 10;

export function authCredentialEmailRateKey(email: string): string {
  return `auth-email:${email.trim().toLowerCase()}`;
}

export async function takeAuthCredentialEmailBucket(
  prisma: RateDb,
  email: string,
  now = Date.now(),
): Promise<number> {
  const key = authCredentialEmailRateKey(email);
  const windowStart = new Date(
    Math.floor(now / AUTH_CREDENTIAL_EMAIL_WINDOW_MS) * AUTH_CREDENTIAL_EMAIL_WINDOW_MS,
  );
  return runAsSystem("count auth credential email bucket", async () => {
    const row = await prisma.apiRateBucket.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    if (Math.random() < 0.01) {
      await prisma.apiRateBucket.deleteMany({
        where: {
          windowStart: { lt: new Date(now - AUTH_CREDENTIAL_EMAIL_WINDOW_MS * 2) },
          key: { startsWith: "auth-email:" },
        },
      });
    }
    return row.count;
  });
}

export function authCredentialEmailRetryAfterSeconds(
  count: number,
  elapsedMs: number,
): number | null {
  if (count <= AUTH_CREDENTIAL_EMAIL_MAX) return null;
  const remaining = AUTH_CREDENTIAL_EMAIL_WINDOW_MS - elapsedMs;
  return Math.max(1, Math.ceil(remaining / 1000));
}
