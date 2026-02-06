import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { now } from "../utils/time.js";
import { EventType } from "../utils/constants.js";
import { logEvent } from "./event-log.service.js";

type Project = typeof schema.projects.$inferSelect;

async function getByUserAndCycle(
  guildId: string,
  userId: string,
  cycleId: number
): Promise<Project | undefined> {
  const rows = await db
    .select()
    .from(schema.projects)
    .where(
      and(
        eq(schema.projects.guildId, guildId),
        eq(schema.projects.userId, userId),
        eq(schema.projects.cycleId, cycleId)
      )
    );
  return rows[0];
}

async function declare(
  guildId: string,
  userId: string,
  cycleId: number,
  title: string,
  description: string,
  expectedArtifact: string
): Promise<Project> {
  await db.insert(schema.projects).values({
    cycleId,
    guildId,
    userId,
    title,
    description,
    expectedArtifact,
    declaredAt: now(),
  });

  await logEvent(guildId, EventType.DECLARATION_SUBMITTED, {
    cycleId,
    userId,
    payload: { title },
  });

  return (await getByUserAndCycle(guildId, userId, cycleId))!;
}

async function getAllForCycle(cycleId: number): Promise<Project[]> {
  return db.select().from(schema.projects).where(eq(schema.projects.cycleId, cycleId));
}

export const projectService = {
  getByUserAndCycle,
  declare,
  getAllForCycle,
};
