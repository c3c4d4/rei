import { and, eq, isNull, lt } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  FREEZE_DAYS_PER_YEAR,
  INITIAL_BLACKHOLE_DAYS,
  MAX_FREEZE_DAYS_PER_USE,
  ProjectDifficultyDays,
} from "../utils/constants.js";
import { addDays, addYears, now } from "../utils/time.js";
import { logger } from "../utils/logger.js";
import { client } from "../client.js";

type Member = typeof schema.members.$inferSelect;
type ProjectContract = typeof schema.projectContracts.$inferSelect;
type Difficulty = keyof typeof ProjectDifficultyDays;

type WorkEligibility = {
  allowed: boolean;
  reason: "ok" | "frozen" | "banned";
  member: Member;
};

function makeInitialTimeline(seedDate: Date = new Date()): {
  blackholeDeadline: string;
  freezeDaysAvailable: number;
  freezeAllowanceResetAt: string;
} {
  return {
    blackholeDeadline: addDays(seedDate, INITIAL_BLACKHOLE_DAYS).toISOString(),
    freezeDaysAvailable: FREEZE_DAYS_PER_YEAR,
    freezeAllowanceResetAt: addYears(seedDate, 1).toISOString(),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function nowMs(): number {
  return new Date().getTime();
}

function daysRemaining(iso: string): number {
  const remainingMs = new Date(iso).getTime() - nowMs();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

async function getMember(guildId: string, userId: string): Promise<Member | undefined> {
  const rows = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.guildId, guildId), eq(schema.members.userId, userId)))
    .limit(1);
  return rows[0];
}

async function refreshFreezeAllowance(guildId: string, userId: string): Promise<Member | undefined> {
  const member = await getMember(guildId, userId);
  if (!member) return undefined;

  let changed = false;
  const updates: Partial<typeof schema.members.$inferInsert> = {};
  const currentNow = new Date();

  if (member.freezeActiveUntil && new Date(member.freezeActiveUntil).getTime() <= currentNow.getTime()) {
    updates.freezeActiveUntil = null;
    changed = true;
  }

  if (new Date(member.freezeAllowanceResetAt).getTime() <= currentNow.getTime()) {
    let resetAt = new Date(member.freezeAllowanceResetAt);
    while (resetAt.getTime() <= currentNow.getTime()) {
      resetAt = addYears(resetAt, 1);
    }
    updates.freezeDaysAvailable = FREEZE_DAYS_PER_YEAR;
    updates.freezeAllowanceResetAt = resetAt.toISOString();
    changed = true;
  }

  if (!changed) return member;

  await db.update(schema.members).set(updates).where(eq(schema.members.id, member.id));
  return getMember(guildId, userId);
}

async function getWorkEligibility(guildId: string, userId: string): Promise<WorkEligibility | undefined> {
  const member = await refreshFreezeAllowance(guildId, userId);
  if (!member) return undefined;
  if (member.bannedAt) return { allowed: false, reason: "banned", member };

  const isFrozen =
    !!member.freezeActiveUntil && new Date(member.freezeActiveUntil).getTime() > nowMs();
  if (isFrozen) return { allowed: false, reason: "frozen", member };
  return { allowed: true, reason: "ok", member };
}

async function activateFreeze(
  guildId: string,
  userId: string,
  days: number
): Promise<
  | { kind: "ok"; member: Member; freezeUntil: string }
  | { kind: "insufficient"; member: Member }
  | { kind: "invalid_days" }
  | { kind: "banned"; member: Member }
  | { kind: "member_not_found" }
> {
  if (!Number.isFinite(days) || days < 1 || days > MAX_FREEZE_DAYS_PER_USE) {
    return { kind: "invalid_days" };
  }

  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const member = await refreshFreezeAllowance(guildId, userId);
    if (!member) return { kind: "member_not_found" };
    if (member.bannedAt) return { kind: "banned", member };
    if (member.freezeDaysAvailable < days) {
      return { kind: "insufficient", member };
    }

    const currentNow = new Date();
    const currentFreezeUntil = member.freezeActiveUntil ? new Date(member.freezeActiveUntil) : null;
    const freezeBase =
      currentFreezeUntil && currentFreezeUntil.getTime() > currentNow.getTime()
        ? currentFreezeUntil
        : currentNow;
    const freezeUntil = addDays(freezeBase, days).toISOString();
    const blackholeDeadline = addDays(new Date(member.blackholeDeadline), days).toISOString();

    const freezeMatch =
      member.freezeActiveUntil === null
        ? isNull(schema.members.freezeActiveUntil)
        : eq(schema.members.freezeActiveUntil, member.freezeActiveUntil);

    const updated = await db
      .update(schema.members)
      .set({
        freezeDaysAvailable: member.freezeDaysAvailable - days,
        freezeActiveUntil: freezeUntil,
        blackholeDeadline,
      })
      .where(
        and(
          eq(schema.members.id, member.id),
          eq(schema.members.freezeDaysAvailable, member.freezeDaysAvailable),
          eq(schema.members.blackholeDeadline, member.blackholeDeadline),
          freezeMatch,
          isNull(schema.members.bannedAt)
        )
      )
      .returning({ id: schema.members.id });

    if (updated.length === 0) {
      continue;
    }

    const refreshed = await getMember(guildId, userId);
    if (!refreshed) return { kind: "member_not_found" };
    return { kind: "ok", member: refreshed, freezeUntil };
  }

  const latest = await refreshFreezeAllowance(guildId, userId);
  if (!latest) return { kind: "member_not_found" };
  if (latest.bannedAt) return { kind: "banned", member: latest };
  return { kind: "insufficient", member: latest };
}

async function awardDaysForProject(
  guildId: string,
  userId: string,
  contract: ProjectContract,
  difficulty: Difficulty
): Promise<number> {
  const member = await getMember(guildId, userId);
  if (!member) return 0;

  const deliveredAt = contract.deliveredAt ? new Date(contract.deliveredAt) : new Date();
  const acceptedAt = new Date(contract.acceptedAt);
  const actualHours = Math.max(1, (deliveredAt.getTime() - acceptedAt.getTime()) / (60 * 60 * 1000));
  const expectedHours = Math.max(1, contract.durationHours);
  const speedRatio = expectedHours / actualHours;
  const speedMultiplier = clamp(speedRatio, 0.5, 2);
  const baseDays = ProjectDifficultyDays[difficulty];
  const awardedDays = Math.max(1, Math.round(baseDays * speedMultiplier));

  await db
    .update(schema.members)
    .set({
      blackholeDeadline: addDays(new Date(member.blackholeDeadline), awardedDays).toISOString(),
    })
    .where(eq(schema.members.id, member.id));

  return awardedDays;
}

async function getBlackholeStatus(
  guildId: string,
  userId: string
): Promise<
  | {
      member: Member;
      daysRemaining: number;
      isFrozen: boolean;
      freezeDaysAvailable: number;
    }
  | undefined
> {
  const member = await refreshFreezeAllowance(guildId, userId);
  if (!member) return undefined;

  const isFrozen =
    !!member.freezeActiveUntil && new Date(member.freezeActiveUntil).getTime() > nowMs();

  return {
    member,
    daysRemaining: daysRemaining(member.blackholeDeadline),
    isFrozen,
    freezeDaysAvailable: member.freezeDaysAvailable,
  };
}

async function settleExpiredMembers(guildId: string): Promise<number> {
  const timestamp = now();
  const expiredMembers = await db
    .select()
    .from(schema.members)
    .where(
      and(
        eq(schema.members.guildId, guildId),
        lt(schema.members.blackholeDeadline, timestamp),
        isNull(schema.members.bannedAt)
      )
    );

  if (expiredMembers.length === 0) return 0;

  let banned = 0;
  for (const member of expiredMembers) {
    await db
      .update(schema.members)
      .set({ bannedAt: timestamp })
      .where(eq(schema.members.id, member.id));

    try {
      const guild =
        client.guilds.cache.get(guildId) ??
        (await client.guilds.fetch(guildId).catch(() => null));
      if (guild) {
        await guild.members.ban(member.userId, {
          reason: "Blackhole countdown reached.",
        });
      }
    } catch (error) {
      logger.error("Failed to ban member after blackhole timeout.", {
        guildId,
        userId: member.userId,
        error: String(error),
      });
    }

    banned++;
  }

  if (banned > 0) {
    logger.warn("Blackhole enforcement banned users.", { guildId, banned });
  }

  return banned;
}

export const blackholeService = {
  makeInitialTimeline,
  refreshFreezeAllowance,
  getWorkEligibility,
  activateFreeze,
  awardDaysForProject,
  getBlackholeStatus,
  settleExpiredMembers,
};
