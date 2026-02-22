import { and, eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { now } from "../utils/time.js";
import { MemberState } from "../utils/constants.js";
import { walletService } from "./wallet.service.js";
import { blackholeService } from "./blackhole.service.js";

type Member = typeof schema.members.$inferSelect;

async function getOrCreateMember(guildId: string, userId: string): Promise<Member> {
  const rows = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.guildId, guildId), eq(schema.members.userId, userId)));

  if (rows.length > 0) {
    await walletService.getOrCreateWallet(guildId, userId);
    const refreshed = await blackholeService.refreshFreezeAllowance(guildId, userId);
    return refreshed ?? rows[0];
  }

  const timeline = blackholeService.makeInitialTimeline(new Date());

  await db
    .insert(schema.members)
    .values({
      guildId,
      userId,
      state: MemberState.ACTIVE,
      consecutiveFailedCycles: 0,
      joinedAt: now(),
      blackholeDeadline: timeline.blackholeDeadline,
      freezeDaysAvailable: timeline.freezeDaysAvailable,
      freezeAllowanceResetAt: timeline.freezeAllowanceResetAt,
      freezeActiveUntil: null,
      bannedAt: null,
    })
    .onConflictDoNothing();

  const created = await db
    .select()
    .from(schema.members)
    .where(and(eq(schema.members.guildId, guildId), eq(schema.members.userId, userId)));

  await walletService.getOrCreateWallet(guildId, userId);
  const refreshed = await blackholeService.refreshFreezeAllowance(guildId, userId);
  return refreshed ?? created[0];
}

async function getAllMembers(guildId: string): Promise<Member[]> {
  return db.select().from(schema.members).where(eq(schema.members.guildId, guildId));
}

export const memberService = {
  getOrCreateMember,
  getAllMembers,
};
