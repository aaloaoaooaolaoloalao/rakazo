import { AUTO_PROVISION_DEFAULT_BOT_SPAWN_KEY } from "@rakazo/core";
import { afterAll, describe, expect, it } from "vitest";
import { ensureAutoProvisionedUser } from "./auto-provision-user.js";
import { bootstrapUserSpace } from "./bootstrap-user.js";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import { asSystem, runAsSystem } from "./row-security.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("ensureAutoProvisionedUser (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  const userId = `auto-provision-${Date.now()}`;
  const email = `${userId}@example.test`;
  let spaceId: string;

  afterAll(async () => {
    if (prisma) {
      await asSystem(prisma).bot.deleteMany({ where: { userId } });
      await asSystem(prisma).computer.deleteMany({ where: { userId } });
      await asSystem(prisma).organization.deleteMany({ where: { id: spaceId } });
      await asSystem(prisma).user.deleteMany({ where: { id: userId } });
    }
    await close?.();
  });

  it("creates a default bot and computer record once, without starting a sandbox", async () => {
    const db = createDb(databaseUrl!);
    prisma = db.prisma;
    close = async () => {
      await db.prisma.$disconnect();
      await db.pool.end();
    };

    await asSystem(prisma).user.create({
      data: {
        id: userId,
        email,
        emailVerified: true,
        name: "Provision Test",
        createdAt: new Date(),
      },
    });
    spaceId = (
      await runAsSystem("bootstrap personal space", () =>
        bootstrapUserSpace(
          prisma,
          { id: userId },
          {
            signupsEnabled: "true",
            signupAllowlist: "",
          },
        ),
      )
    ).spaceId;

    const first = await runAsSystem("auto-provision", () =>
      ensureAutoProvisionedUser(prisma, { id: userId, email }, spaceId, {
        AUTO_PROVISION_NEW_USERS: "true",
        AUTO_PROVISION_DEFAULT_BOT_NAME: "העוזר שלי",
        AUTO_PROVISION_MAX_COMPUTERS_PER_USER: "1",
      }),
    );
    expect(first.created).toBe(true);
    expect(first.botId).toBeTruthy();

    const bot = await asSystem(prisma).bot.findFirst({
      where: { id: first.botId! },
      include: { computer: true },
    });
    expect(bot!.spawnKey).toBe(AUTO_PROVISION_DEFAULT_BOT_SPAWN_KEY);
    expect(bot!.name).toBe("העוזר שלי");
    expect(bot!.computer).toBeTruthy();
    expect(bot!.computer!.providerRef).toBeNull();

    const second = await runAsSystem("auto-provision retry", () =>
      ensureAutoProvisionedUser(prisma, { id: userId, email }, spaceId, {
        AUTO_PROVISION_NEW_USERS: "true",
      }),
    );
    expect(second.created).toBe(false);
    expect(second.botId).toBe(first.botId);
  });
});
