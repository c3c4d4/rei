import { db, schema } from "../db/index.js";
import { now } from "../utils/time.js";
import type { EventType } from "../utils/constants.js";

export async function logEvent(
  guildId: string,
  eventType: EventType,
  opts?: { cycleId?: number; userId?: string; payload?: Record<string, unknown> }
): Promise<void> {
  await db.insert(schema.eventsLog).values({
    guildId,
    eventType,
    cycleId: opts?.cycleId ?? null,
    userId: opts?.userId ?? null,
    payload: opts?.payload ? JSON.stringify(opts.payload) : null,
    createdAt: now(),
  });
}
