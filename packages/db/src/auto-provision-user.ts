import type { Actor } from "@rakazo/contracts";
import {
  AUTO_PROVISION_DEFAULT_BOT_SPAWN_KEY,
  type AutoProvisionEnv,
  autoProvisionDefaultBotName,
  autoProvisionMaxComputersPerUser,
  autoProvisionNewUsersEnabled,
} from "@rakazo/core";
import type { PrismaClient } from "./client.js";
import { resolveMaxComputersPerUser } from "./computers.js";
import { createRepos } from "./repos.js";
import { runAsTenant } from "./row-security.js";

export type EnsureAutoProvisionResult = {
  /** A new default bot was created in this call. */
  created: boolean;
  botId: string | null;
  skippedReason?: "disabled" | "existing_bot" | "computer_cap";
};

async function countLiveComputersForUser(prisma: PrismaClient, userId: string): Promise<number> {
  return prisma.computer.count({
    where: {
      userId,
      bots: { some: { archivedAt: null } },
    },
  });
}

function effectiveComputerCap(env: AutoProvisionEnv): number {
  const provisionCap = autoProvisionMaxComputersPerUser(env);
  const sandboxCap = resolveMaxComputersPerUser();
  if (sandboxCap <= 0) return provisionCap;
  return Math.min(provisionCap, sandboxCap);
}

/**
 * Ensures a new member has a default bot (and DB computer record) in their personal space.
 * Does not start a sandbox; E2B/docker provisioning stays on first run via the executor.
 */
export async function ensureAutoProvisionedUser(
  prisma: PrismaClient,
  user: { id: string; email: string },
  spaceId: string,
  env: AutoProvisionEnv = process.env,
): Promise<EnsureAutoProvisionResult> {
  if (!autoProvisionNewUsersEnabled(env)) {
    return { created: false, botId: null, skippedReason: "disabled" };
  }

  const existingSpawn = await prisma.bot.findFirst({
    where: {
      userId: user.id,
      spaceId,
      spawnKey: AUTO_PROVISION_DEFAULT_BOT_SPAWN_KEY,
      archivedAt: null,
    },
    select: { id: true },
  });
  if (existingSpawn) {
    return { created: false, botId: existingSpawn.id, skippedReason: "existing_bot" };
  }

  const anyLiveBot = await prisma.bot.findFirst({
    where: { userId: user.id, spaceId, archivedAt: null },
    select: { id: true },
  });
  if (anyLiveBot) {
    return { created: false, botId: anyLiveBot.id, skippedReason: "existing_bot" };
  }

  const cap = effectiveComputerCap(env);
  if (cap === 0) {
    return { created: false, botId: null, skippedReason: "computer_cap" };
  }
  const inUse = await countLiveComputersForUser(prisma, user.id);
  if (inUse >= cap) {
    return { created: false, botId: null, skippedReason: "computer_cap" };
  }

  const name = autoProvisionDefaultBotName(env);
  const actor: Actor = {
    userId: user.id,
    spaceId,
    email: user.email,
    isDeploymentOwner: false,
  };

  const bot = await runAsTenant({ spaceId, userId: user.id }, () =>
    createRepos(prisma).createBot(actor, {
      name,
      title: "",
      description: "",
      instructions: "",
      notifyOnFinish: true,
      spawnKey: AUTO_PROVISION_DEFAULT_BOT_SPAWN_KEY,
    }),
  );

  return { created: true, botId: bot.id };
}
