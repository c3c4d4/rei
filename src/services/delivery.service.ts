import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { now } from "../utils/time.js";
import { EventType } from "../utils/constants.js";
import { logEvent } from "./event-log.service.js";

type Delivery = typeof schema.deliveries.$inferSelect;

async function getByProject(projectId: number): Promise<Delivery | undefined> {
  const rows = await db
    .select()
    .from(schema.deliveries)
    .where(eq(schema.deliveries.projectId, projectId));
  return rows[0];
}

async function getAllForCycle(cycleId: number): Promise<Delivery[]> {
  return db.select().from(schema.deliveries).where(eq(schema.deliveries.cycleId, cycleId));
}

async function submit(
  guildId: string,
  userId: string,
  cycleId: number,
  projectId: number,
  link: string | null,
  attachmentUrl: string | null
): Promise<Delivery> {
  await db.insert(schema.deliveries).values({
    projectId,
    cycleId,
    guildId,
    userId,
    link,
    attachmentUrl,
    submittedAt: now(),
  });

  await logEvent(guildId, EventType.DELIVERY_SUBMITTED, {
    cycleId,
    userId,
    payload: { projectId },
  });

  return (await getByProject(projectId))!;
}

export const deliveryService = {
  getByProject,
  getAllForCycle,
  submit,
};
