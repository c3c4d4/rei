import {
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits,
} from "discord.js";
import { and, eq } from "drizzle-orm";
import { client } from "../client.js";
import { db, schema } from "../db/index.js";
import { addHours, isPast, now } from "../utils/time.js";
import { logger } from "../utils/logger.js";

type Cycle = typeof schema.cycles.$inferSelect;
type Milestone = "declaration_deadline" | "production_deadline" | "review_deadline";

const MILESTONES: Array<{
  key: Milestone;
  title: string;
  description: string;
  dateFromCycle: (cycle: Cycle) => string;
}> = [
  {
    key: "declaration_deadline",
    title: "Fim de Declarações",
    description: "Prazo final para declarar projetos do ciclo.",
    dateFromCycle: (cycle) => cycle.declarationDeadline,
  },
  {
    key: "production_deadline",
    title: "Fim de Produção",
    description: "Prazo final para submeter entregas.",
    dateFromCycle: (cycle) => cycle.productionDeadline,
  },
  {
    key: "review_deadline",
    title: "Fim de Revisão e Encerramento",
    description: "Prazo final de revisões e fechamento do ciclo.",
    dateFromCycle: (cycle) => cycle.reviewDeadline,
  },
];

async function canManageEvents(guildId: string): Promise<boolean> {
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return false;
  const me = await guild.members.fetchMe().catch(() => null);
  if (!me) return false;
  return me.permissions.has(PermissionFlagsBits.ManageEvents);
}

async function upsertMilestoneEvent(cycle: Cycle, milestone: (typeof MILESTONES)[number]): Promise<boolean> {
  const startIso = milestone.dateFromCycle(cycle);

  const existingRows = await db
    .select()
    .from(schema.discordScheduledEvents)
    .where(
      and(
        eq(schema.discordScheduledEvents.cycleId, cycle.id),
        eq(schema.discordScheduledEvents.milestone, milestone.key)
      )
    );
  const existing = existingRows[0];

  if (isPast(startIso)) {
    if (existing) {
      const guild = await client.guilds.fetch(cycle.guildId).catch(() => null);
      const event = guild ? await guild.scheduledEvents.fetch(existing.discordEventId).catch(() => null) : null;
      if (event) {
        await event.delete().catch(() => null);
      }
      await db.delete(schema.discordScheduledEvents).where(eq(schema.discordScheduledEvents.id, existing.id));
    }
    return false;
  }

  const guild = await client.guilds.fetch(cycle.guildId).catch(() => null);
  if (!guild) return false;

  const payload = {
    name: `REI - Ciclo ${cycle.cycleNumber}: ${milestone.title}`,
    description: `${milestone.description}\nCiclo ${cycle.cycleNumber}.`,
    scheduledStartTime: startIso,
    scheduledEndTime: addHours(new Date(startIso), 1).toISOString(),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.External,
    entityMetadata: { location: "Servidor Discord" },
  } as const;

  if (existing) {
    const event = await guild.scheduledEvents.fetch(existing.discordEventId).catch(() => null);
    if (event) {
      await event.edit(payload);
      await db
        .update(schema.discordScheduledEvents)
        .set({ syncedAt: now() })
        .where(eq(schema.discordScheduledEvents.id, existing.id));
      return true;
    }
  }

  const created = await guild.scheduledEvents.create(payload);
  await db
    .insert(schema.discordScheduledEvents)
    .values({
      guildId: cycle.guildId,
      cycleId: cycle.id,
      milestone: milestone.key,
      discordEventId: created.id,
      syncedAt: now(),
    })
    .onConflictDoUpdate({
      target: [schema.discordScheduledEvents.cycleId, schema.discordScheduledEvents.milestone],
      set: { discordEventId: created.id, syncedAt: now() },
    });

  return true;
}

async function syncCycleScheduledEvents(cycle: Cycle): Promise<{ synced: number; skipped: number }> {
  const hasPermission = await canManageEvents(cycle.guildId);
  if (!hasPermission) {
    logger.warn("Sem permissao ManageEvents para sincronizar eventos.", { guildId: cycle.guildId, cycleId: cycle.id });
    return { synced: 0, skipped: MILESTONES.length };
  }

  let synced = 0;
  let skipped = 0;

  for (const milestone of MILESTONES) {
    try {
      const ok = await upsertMilestoneEvent(cycle, milestone);
      if (ok) synced++;
      else skipped++;
    } catch (error) {
      skipped++;
      logger.error("Falha ao sincronizar evento agendado.", {
        guildId: cycle.guildId,
        cycleId: cycle.id,
        milestone: milestone.key,
        error: String(error),
      });
    }
  }

  return { synced, skipped };
}

async function deleteCycleScheduledEvents(guildId: string, cycleId: number): Promise<number> {
  const rows = await db
    .select()
    .from(schema.discordScheduledEvents)
    .where(and(eq(schema.discordScheduledEvents.guildId, guildId), eq(schema.discordScheduledEvents.cycleId, cycleId)));

  if (rows.length === 0) return 0;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  let deleted = 0;

  for (const row of rows) {
    if (guild) {
      const event = await guild.scheduledEvents.fetch(row.discordEventId).catch(() => null);
      if (event) {
        await event.delete().catch(() => null);
      }
    }
    deleted++;
  }

  await db
    .delete(schema.discordScheduledEvents)
    .where(and(eq(schema.discordScheduledEvents.guildId, guildId), eq(schema.discordScheduledEvents.cycleId, cycleId)));

  return deleted;
}

export const discordScheduledEventService = {
  syncCycleScheduledEvents,
  deleteCycleScheduledEvents,
};
