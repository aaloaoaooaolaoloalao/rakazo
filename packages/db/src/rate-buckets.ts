import type { PrismaClient } from "./generated/prisma/client.js";
import { runAsSystem } from "./row-security.js";

type RateDb = Pick<PrismaClient, "apiRateBucket">;

/** Increment the bucket for the current window and return the count including this request. */
export async function takeRateBucket(
  prisma: RateDb,
  key: string,
  now = new Date(),
  windowMs = 60_000,
): Promise<number> {
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  return runAsSystem("count an api rate bucket", async () => {
    const row = await prisma.apiRateBucket.upsert({
      where: { key_windowStart: { key, windowStart } },
      create: { key, windowStart, count: 1 },
      update: { count: { increment: 1 } },
    });
    if (Math.random() < 0.01) {
      await prisma.apiRateBucket.deleteMany({
        where: {
          windowStart: { lt: new Date(now.getTime() - Math.max(10 * 60_000, 2 * windowMs)) },
        },
      });
    }
    return row.count;
  });
}
