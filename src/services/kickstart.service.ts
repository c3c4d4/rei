import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import {
  FREEZE_DAYS_PER_YEAR,
  INITIAL_BLACKHOLE_DAYS,
  INITIAL_REVIEW_CREDITS,
  MemberState,
} from "../utils/constants.js";
import { addDays, addYears, now } from "../utils/time.js";

type KickstartResult = {
  startedAt: string;
  blackholeDeadline: string;
  freezeResetAt: string;
  membersSeeded: number;
};

async function kickstartGuild(guildId: string, userIds: string[]): Promise<KickstartResult> {
  const uniqueUserIds = Array.from(new Set(userIds)).filter(Boolean);
  const startedAt = now();
  const startedAtDate = new Date(startedAt);
  const blackholeDeadline = addDays(startedAtDate, INITIAL_BLACKHOLE_DAYS).toISOString();
  const freezeResetAt = addYears(startedAtDate, 1).toISOString();

  await db.transaction(async (tx) => {
    await tx.delete(schema.walletLedger).where(eq(schema.walletLedger.guildId, guildId));
    await tx.delete(schema.reviewThreads).where(eq(schema.reviewThreads.guildId, guildId));
    await tx.delete(schema.reviews).where(eq(schema.reviews.guildId, guildId));
    await tx.delete(schema.reviewAssignments).where(eq(schema.reviewAssignments.guildId, guildId));
    await tx.delete(schema.deliveries).where(eq(schema.deliveries.guildId, guildId));
    await tx.delete(schema.projects).where(eq(schema.projects.guildId, guildId));
    await tx.delete(schema.projectContracts).where(eq(schema.projectContracts.guildId, guildId));
    await tx.delete(schema.discordScheduledEvents).where(eq(schema.discordScheduledEvents.guildId, guildId));
    await tx.delete(schema.cycles).where(eq(schema.cycles.guildId, guildId));
    await tx.delete(schema.eventsLog).where(eq(schema.eventsLog.guildId, guildId));
    await tx.delete(schema.memberStateHistory).where(eq(schema.memberStateHistory.guildId, guildId));

    for (const userId of uniqueUserIds) {
      await tx
        .insert(schema.members)
        .values({
          guildId,
          userId,
          state: MemberState.ACTIVE,
          consecutiveFailedCycles: 0,
          joinedAt: startedAt,
          lastActiveAt: null,
          blackholeDeadline,
          freezeDaysAvailable: FREEZE_DAYS_PER_YEAR,
          freezeActiveUntil: null,
          freezeAllowanceResetAt: freezeResetAt,
          bannedAt: null,
        })
        .onConflictDoUpdate({
          target: [schema.members.guildId, schema.members.userId],
          set: {
            state: MemberState.ACTIVE,
            consecutiveFailedCycles: 0,
            lastActiveAt: null,
            blackholeDeadline,
            freezeDaysAvailable: FREEZE_DAYS_PER_YEAR,
            freezeActiveUntil: null,
            freezeAllowanceResetAt: freezeResetAt,
            bannedAt: null,
          },
        });

      await tx
        .insert(schema.wallets)
        .values({
          guildId,
          userId,
          balance: INITIAL_REVIEW_CREDITS,
          createdAt: startedAt,
          updatedAt: startedAt,
        })
        .onConflictDoUpdate({
          target: [schema.wallets.guildId, schema.wallets.userId],
          set: {
            balance: INITIAL_REVIEW_CREDITS,
            updatedAt: startedAt,
          },
        });

      await tx.insert(schema.walletLedger).values({
        guildId,
        cycleId: null,
        userId,
        assignmentId: null,
        relatedUserId: null,
        entryType: "seed",
        delta: INITIAL_REVIEW_CREDITS,
        note: "kickstart_seed",
        createdAt: startedAt,
      });
    }
  });

  return {
    startedAt,
    blackholeDeadline,
    freezeResetAt,
    membersSeeded: uniqueUserIds.length,
  };
}

export const kickstartService = {
  kickstartGuild,
};
