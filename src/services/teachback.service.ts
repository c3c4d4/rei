import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { now } from "../utils/time.js";
import { EventType } from "../utils/constants.js";
import { logEvent } from "./event-log.service.js";

type Teachback = typeof schema.teachbacks.$inferSelect;

async function getByUserAndCycle(
  guildId: string,
  userId: string,
  cycleId: number
): Promise<Teachback | undefined> {
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
  return rows[0];
}

async function register(
  guildId: string,
  userId: string,
  cycleId: number,
  topic: string,
  content: string
): Promise<Teachback> {
  await db.insert(schema.teachbacks).values({
    cycleId,
    guildId,
    userId,
    topic,
    content,
    registeredAt: now(),
  });

  await logEvent(guildId, EventType.TEACHBACK_REGISTERED, {
    cycleId,
    userId,
    payload: { topic },
  });

  return (await getByUserAndCycle(guildId, userId, cycleId))!;
}

async function getAllForCycle(cycleId: number): Promise<Teachback[]> {
  return db.select().from(schema.teachbacks).where(eq(schema.teachbacks.cycleId, cycleId));
}

export const teachbackService = {
  getByUserAndCycle,
  register,
  getAllForCycle,
};
