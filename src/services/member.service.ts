import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { now } from "../utils/time.js";
import { MemberState, EventType, PRESENCE_THRESHOLD, CONSECUTIVE_FAIL_LIMIT } from "../utils/constants.js";
import { logEvent } from "./event-log.service.js";
import { logger } from "../utils/logger.js";

type Member = typeof schema.members.$inferSelect;

async function getOrCreateMember(guildId: string, userId: string): Promise<Member> {
  const rows = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.guildId, guildId), eq(schema.members.userId, userId)));

  if (rows.length > 0) return rows[0];

  await db.insert(schema.members).values({
    guildId,
    userId,
    state: MemberState.ACTIVE,
    consecutiveFailedCycles: 0,
    joinedAt: now(),
  });

  const created = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.guildId, guildId), eq(schema.members.userId, userId)));

  return created[0];
}

async function getAllMembers(guildId: string): Promise<Member[]> {
  return db.select().from(schema.members).where(eq(schema.members.guildId, guildId));
}

async function hasDelivery(guildId: string, userId: string, cycleId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.deliveries)
    .where(
      and(
        eq(schema.deliveries.guildId, guildId),
        eq(schema.deliveries.userId, userId),
        eq(schema.deliveries.cycleId, cycleId)
      )
    );
  return rows.length > 0;
}

async function hasCompletedReview(guildId: string, userId: string, cycleId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.reviews)
    .where(
      and(
        eq(schema.reviews.guildId, guildId),
        eq(schema.reviews.reviewerUserId, userId),
        eq(schema.reviews.cycleId, cycleId)
      )
    );
  return rows.length > 0;
}

async function hasTeachback(guildId: string, userId: string, cycleId: number): Promise<boolean> {
  const rows = await db
    .select()
    .from(schema.teachbacks)
    .where(
      and(
        eq(schema.teachbacks.guildId, guildId),
        eq(schema.teachbacks.userId, userId),
        eq(schema.teachbacks.cycleId, cycleId)
      )
    );
  return rows.length > 0;
}

async function calculatePresenceScore(guildId: string, userId: string, cycleId: number): Promise<number> {
  let score = 0;
  if (await hasDelivery(guildId, userId, cycleId)) score++;
  if (await hasCompletedReview(guildId, userId, cycleId)) score++;
  if (await hasTeachback(guildId, userId, cycleId)) score++;
  return score;
}

async function transitionState(
  member: Member,
  newState: MemberState,
  reason: string,
  cycleId: number
): Promise<void> {
  await db
    .update(schema.members)
    .set({ state: newState, lastActiveAt: now() })
    .where(eq(schema.members.id, member.id));

  await db.insert(schema.memberStateHistory).values({
    guildId: member.guildId,
    userId: member.userId,
    previousState: member.state,
    newState,
    reason,
    cycleId,
    changedAt: now(),
  });

  await logEvent(member.guildId, EventType.MEMBER_STATE_CHANGED, {
    userId: member.userId,
    cycleId,
    payload: { from: member.state, to: newState, reason },
  });

  logger.info("Estado alterado.", {
    guildId: member.guildId,
    userId: member.userId,
    from: member.state,
    to: newState,
  });
}

async function evaluateAllMembers(
  guildId: string,
  cycleId: number
): Promise<{ userId: string; newState: MemberState }[]> {
  const members = await getAllMembers(guildId);
  const changes: { userId: string; newState: MemberState }[] = [];

  for (const member of members) {
    if (member.state === MemberState.ACTIVE) {
      const score = await calculatePresenceScore(guildId, member.userId, cycleId);

      if (score >= PRESENCE_THRESHOLD) {
        await db
          .update(schema.members)
          .set({ consecutiveFailedCycles: 0, lastActiveAt: now() })
          .where(eq(schema.members.id, member.id));
      } else {
        const newFailed = member.consecutiveFailedCycles + 1;
        await db
          .update(schema.members)
          .set({ consecutiveFailedCycles: newFailed })
          .where(eq(schema.members.id, member.id));

        if (newFailed >= CONSECUTIVE_FAIL_LIMIT) {
          await transitionState(
            member,
            MemberState.OBSERVER,
            "2 ciclos consecutivos sem cumprir requisitos mínimos.",
            cycleId
          );
          changes.push({ userId: member.userId, newState: MemberState.OBSERVER });
        }
      }
    } else if (member.state === MemberState.OBSERVER) {
      let obsScore = 0;
      if (await hasCompletedReview(guildId, member.userId, cycleId)) obsScore++;
      if (await hasTeachback(guildId, member.userId, cycleId)) obsScore++;
      if (await hasDelivery(guildId, member.userId, cycleId)) obsScore++;

      if (obsScore >= PRESENCE_THRESHOLD) {
        await transitionState(
          member,
          MemberState.ACTIVE,
          "Requisitos cumpridos como observador.",
          cycleId
        );
        changes.push({ userId: member.userId, newState: MemberState.ACTIVE });
      }
    }
  }

  return changes;
}

export const memberService = {
  getOrCreateMember,
  getAllMembers,
  hasDelivery,
  hasCompletedReview,
  hasTeachback,
  calculatePresenceScore,
  evaluateAllMembers,
};
