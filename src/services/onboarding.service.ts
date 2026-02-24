import type { Guild, GuildMember } from "discord.js";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { memberService } from "./member.service.js";
import { MemberState } from "../utils/constants.js";
import { now } from "../utils/time.js";
import { logger } from "../utils/logger.js";

type GuildRoleConfig = {
  activeRoleId: string | null;
  observerRoleId: string | null;
};

type OnboardingSyncResult = {
  onboarded: number;
  skippedBots: number;
  failed: number;
};

const guildSyncInFlight = new Map<string, Promise<OnboardingSyncResult>>();

async function ensureGuildRegistered(guildId: string): Promise<void> {
  await db
    .insert(schema.guilds)
    .values({
      guildId,
      createdAt: now(),
    })
    .onConflictDoNothing();
}

async function getGuildRoleConfig(guildId: string): Promise<GuildRoleConfig> {
  const rows = await db
    .select({
      activeRoleId: schema.guilds.activeRoleId,
      observerRoleId: schema.guilds.observerRoleId,
    })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId))
    .limit(1);

  if (!rows[0]) {
    return {
      activeRoleId: null,
      observerRoleId: null,
    };
  }

  return rows[0];
}

async function syncConfiguredRole(member: GuildMember, state: string): Promise<void> {
  const config = await getGuildRoleConfig(member.guild.id);
  const targetRoleId =
    state === MemberState.OBSERVER ? config.observerRoleId : config.activeRoleId;
  const oppositeRoleId =
    state === MemberState.OBSERVER ? config.activeRoleId : config.observerRoleId;

  if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
    await member.roles.add(targetRoleId).catch((error) => {
      logger.warn("Failed to assign configured member role.", {
        guildId: member.guild.id,
        userId: member.id,
        roleId: targetRoleId,
        error: String(error),
      });
    });
  }

  if (
    oppositeRoleId &&
    oppositeRoleId !== targetRoleId &&
    member.roles.cache.has(oppositeRoleId)
  ) {
    await member.roles.remove(oppositeRoleId).catch((error) => {
      logger.warn("Failed to remove opposite configured member role.", {
        guildId: member.guild.id,
        userId: member.id,
        roleId: oppositeRoleId,
        error: String(error),
      });
    });
  }
}

async function onboardGuildMember(member: GuildMember): Promise<void> {
  if (member.user.bot) return;

  const guildId = member.guild.id;
  await ensureGuildRegistered(guildId);

  const dbMember = await memberService.getOrCreateMember(guildId, member.id);
  await syncConfiguredRole(member, dbMember.state);
}

async function runGuildOnboardingSync(guild: Guild): Promise<OnboardingSyncResult> {
  await ensureGuildRegistered(guild.id);

  const members = await guild.members.fetch();
  let onboarded = 0;
  let skippedBots = 0;
  let failed = 0;

  for (const [, member] of members) {
    if (member.user.bot) {
      skippedBots++;
      continue;
    }

    try {
      await onboardGuildMember(member);
      onboarded++;
    } catch (error) {
      failed++;
      logger.error("Failed to onboard member during guild sync.", {
        guildId: guild.id,
        userId: member.id,
        error: String(error),
      });
    }
  }

  logger.info("Guild onboarding sync completed.", {
    guildId: guild.id,
    onboarded,
    skippedBots,
    failed,
  });

  return {
    onboarded,
    skippedBots,
    failed,
  };
}

async function onboardGuildMembers(guild: Guild): Promise<OnboardingSyncResult> {
  const existingTask = guildSyncInFlight.get(guild.id);
  if (existingTask) return existingTask;

  const task = runGuildOnboardingSync(guild).finally(() => {
    guildSyncInFlight.delete(guild.id);
  });
  guildSyncInFlight.set(guild.id, task);
  return task;
}

export const onboardingService = {
  onboardGuildMember,
  onboardGuildMembers,
};
