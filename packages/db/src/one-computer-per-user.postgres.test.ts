import type { Actor } from "@rakazo/contracts";
import { afterAll, describe, expect, it } from "vitest";
import { bootstrapUserSpace } from "./bootstrap-user.js";
import type { PrismaClient } from "./client.js";
import { createDb } from "./client.js";
import { legacyTeamScopeKey } from "./computers.js";
import { createRepos } from "./repos.js";
import { createSpaceForMember } from "./spaces.js";
import { asSystem, runAsSystem, runAsTenant } from "./row-security.js";
import { restoreBotUnderComputerQuota } from "./computers.js";

const databaseUrl = process.env.DATABASE_URL;
const describePostgres =
  process.env.VERIFY_DATABASE && databaseUrl ? describe.sequential : describe.skip;

describePostgres("one computer per user (PostgreSQL)", () => {
  let prisma: PrismaClient;
  let close: () => Promise<void>;
  const userId = `one-pc-${Date.now()}`;
  const email = `${userId}@example.test`;
  let spaceA = "";
  let spaceB = "";

  function actor(spaceId: string): Actor {
    return { userId, spaceId, email, isDeploymentOwner: false };
  }

  afterAll(async () => {
    if (prisma) {
      await asSystem(prisma).bot.deleteMany({ where: { userId } });
      await asSystem(prisma).computer.deleteMany({ where: { userId } });
      if (spaceA || spaceB) {
        await asSystem(prisma).organization.deleteMany({
          where: { id: { in: [spaceA, spaceB].filter(Boolean) } },
        });
      }
      await asSystem(prisma).user.deleteMany({ where: { id: userId } });
    }
    await close?.();
  });

  it("dedicated create and setComputer normalize to one shared team computer across spaces", async () => {
    process.env.SANDBOX_MAX_COMPUTERS_PER_USER = "1";
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
        name: "One PC",
        createdAt: new Date(),
      },
    });
    spaceA = (
      await runAsSystem("bootstrap A", () =>
        bootstrapUserSpace(prisma, { id: userId }, { signupsEnabled: "true", signupAllowlist: "" }),
      )
    ).spaceId;

    const first = await runAsTenant({ spaceId: spaceA, userId }, () =>
      createRepos(prisma).createBot(actor(spaceA), {
        name: "BotA",
        title: "",
        description: "",
        instructions: "",
        notifyOnFinish: false,
        computerMode: "dedicated",
      }),
    );
    expect(first.computer?.scope).toBe("team");
    expect(await asSystem(prisma).computer.count({ where: { userId } })).toBe(1);

    const other = await runAsSystem("second space", () =>
      createSpaceForMember(prisma, {
        currentSpaceId: spaceA,
        userId,
        name: "Space B",
      }),
    );
    spaceB = other.id;

    const second = await runAsTenant({ spaceId: spaceB, userId }, () =>
      createRepos(prisma).createBot(actor(spaceB), {
        name: "BotB",
        title: "",
        description: "",
        instructions: "",
        notifyOnFinish: false,
      }),
    );
    expect(second.computerId).toBe(first.computerId);
    expect(await asSystem(prisma).computer.count({ where: { userId } })).toBe(1);

    const switched = await runAsTenant({ spaceId: spaceA, userId }, () =>
      createRepos(prisma).setBotComputer(actor(spaceA), first.id, "dedicated"),
    );
    expect(switched.computer?.scope).toBe("team");
    expect(switched.computerId).toBe(first.computerId);
  });

  it("allows restoring an archived bot when the user is under the cap", async () => {
    const bot = await asSystem(prisma).bot.findFirst({ where: { userId, spaceId: spaceA } });
    expect(bot).toBeTruthy();
    await asSystem(prisma).bot.update({
      where: { id: bot!.id },
      data: { archivedAt: new Date() },
    });
    await runAsSystem("restore", () =>
      restoreBotUnderComputerQuota(prisma, {
        userId,
        botId: bot!.id,
        computerId: bot!.computerId!,
      }),
    );
    const live = await asSystem(prisma).bot.findUnique({ where: { id: bot!.id } });
    expect(live?.archivedAt).toBeNull();
  });

  it("does not remove legacy rows when a user already has two computers", async () => {
    const legacyUser = `legacy-two-${Date.now()}`;
    await asSystem(prisma).user.create({
      data: {
        id: legacyUser,
        email: `${legacyUser}@example.test`,
        emailVerified: true,
        name: "Legacy",
        createdAt: new Date(),
      },
    });
    const legacySpace = (
      await runAsSystem("bootstrap legacy", () =>
        bootstrapUserSpace(
          prisma,
          { id: legacyUser },
          { signupsEnabled: "true", signupAllowlist: "" },
        ),
      )
    ).spaceId;

    const teamRow = await asSystem(prisma).computer.create({
      data: {
        spaceId: legacySpace,
        userId: legacyUser,
        scope: "team",
        scopeKey: legacyTeamScopeKey(legacySpace, legacyUser),
        homeKey: "team-legacy-a",
        kind: "docker",
      },
    });
    const dedicatedRow = await asSystem(prisma).computer.create({
      data: {
        spaceId: legacySpace,
        userId: legacyUser,
        scope: "dedicated",
        scopeKey: "bot:legacy-bot",
        homeKey: "legacy-bot",
        kind: "docker",
      },
    });

    expect(await asSystem(prisma).computer.count({ where: { userId: legacyUser } })).toBe(2);
    expect(teamRow.id).not.toBe(dedicatedRow.id);

    await asSystem(prisma).computer.deleteMany({ where: { userId: legacyUser } });
    await asSystem(prisma).organization.deleteMany({ where: { id: legacySpace } });
    await asSystem(prisma).user.deleteMany({ where: { id: legacyUser } });
  });
});
