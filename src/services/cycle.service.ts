import { db, schema } from "../db/index.js";
import { eq, and, ne, desc } from "drizzle-orm";
import { CyclePhase, EventType } from "../utils/constants.js";
import { now, calculateDeadlines, formatShort } from "../utils/time.js";
import { logEvent } from "./event-log.service.js";
import { messages } from "../utils/messages.js";
import { logger } from "../utils/logger.js";
import { client } from "../client.js";
import type { TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { rei } from "../utils/embeds.js";
import { discordScheduledEventService } from "./discord-scheduled-event.service.js";

type Cycle = typeof schema.cycles.$inferSelect;
type GuildConfig = typeof schema.guilds.$inferSelect;

async function hasPendingReviewAssignments(cycleId: number): Promise<boolean> {
  const pending = await db
    .select({ id: schema.reviewAssignments.id })
    .from(schema.reviewAssignments)
    .where(
      and(
        eq(schema.reviewAssignments.cycleId, cycleId),
        eq(schema.reviewAssignments.completed, false)
      )
    )
    .limit(1);

  return pending.length > 0;
}

async function getActiveCycle(guildId: string): Promise<Cycle | undefined> {
  const rows = await db
    .select()
    .from(schema.cycles)
    .where(and(eq(schema.cycles.guildId, guildId), ne(schema.cycles.phase, CyclePhase.CLOSED)));
  return rows[0];
}

async function getCycleById(cycleId: number): Promise<Cycle | undefined> {
  const rows = await db.select().from(schema.cycles).where(eq(schema.cycles.id, cycleId));
  return rows[0];
}

async function getLastCycleNumber(guildId: string): Promise<number> {
  const rows = await db
    .select({ cycleNumber: schema.cycles.cycleNumber })
    .from(schema.cycles)
    .where(eq(schema.cycles.guildId, guildId))
    .orderBy(desc(schema.cycles.cycleNumber))
    .limit(1);
  return rows[0]?.cycleNumber ?? 0;
}

async function getGuildConfig(guildId: string): Promise<GuildConfig | undefined> {
  const rows = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  return rows[0];
}

async function announce(guildId: string, content: string | EmbedBuilder | EmbedBuilder[]): Promise<void> {
  const config = await getGuildConfig(guildId);
  if (!config?.announcementChannelId) return;

  try {
    const channel = await client.channels.fetch(config.announcementChannelId);
    if (channel?.isTextBased()) {
      if (typeof content === "string") {
        await (channel as TextChannel).send(content);
      } else {
        const embeds = Array.isArray(content) ? content : [content];
        await (channel as TextChannel).send({ embeds });
      }
    }
  } catch (error) {
    logger.error("Falha ao enviar anúncio.", { guildId, error: String(error) });
  }
}

async function openCycle(guildId: string): Promise<Cycle | null> {
  const existing = await getActiveCycle(guildId);
  if (existing) {
    logger.warn("Ciclo já ativo.", { guildId, cycleId: existing.id });
    return null;
  }

  const config = await getGuildConfig(guildId);
  if (!config) {
    logger.error("Guild não configurada.", { guildId });
    return null;
  }

  const startDate = new Date();
  const deadlines = calculateDeadlines(startDate, config);
  const cycleNumber = (await getLastCycleNumber(guildId)) + 1;

  await db.insert(schema.cycles).values({
    guildId,
    cycleNumber,
    phase: CyclePhase.DECLARATION,
    startedAt: startDate.toISOString(),
    declarationDeadline: deadlines.declarationDeadline,
    productionDeadline: deadlines.productionDeadline,
    reviewDeadline: deadlines.reviewDeadline,
  });

  const cycle = await getActiveCycle(guildId);
  if (!cycle) return null;

  await logEvent(guildId, EventType.CYCLE_OPENED, {
    cycleId: cycle.id,
    payload: { cycleNumber, deadlines },
  });

  await announce(guildId, rei.announcement(`Ciclo ${cycleNumber} iniciado`)
    .addFields({ name: "Declarações abertas até", value: `${formatShort(deadlines.declarationDeadline)} (Brasília)` }));

  logger.info("Ciclo aberto.", { guildId, cycleNumber, cycleId: cycle.id });
  await discordScheduledEventService.syncCycleScheduledEvents(cycle);
  return cycle;
}

async function closeDeclaration(cycleId: number): Promise<void> {
  const cycle = await getCycleById(cycleId);
  if (!cycle || cycle.phase !== CyclePhase.DECLARATION) return;

  await db
    .update(schema.cycles)
    .set({ phase: CyclePhase.PRODUCTION })
    .where(eq(schema.cycles.id, cycleId));

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.cycleId, cycleId));

  await logEvent(cycle.guildId, EventType.DECLARATION_DEADLINE_PASSED, {
    cycleId,
    payload: { projectCount: projects.length },
  });

  await announce(cycle.guildId, rei.announcement("Declaração Encerrada",
    `Período de declaração encerrado. ${projects.length} projetos registrados.`));
  logger.info("Declarações encerradas.", { cycleId, projects: projects.length });

  const updated = await getCycleById(cycleId);
  if (updated) {
    await discordScheduledEventService.syncCycleScheduledEvents(updated);
  }
}

async function startReviewPhase(cycleId: number): Promise<void> {
  const cycle = await getCycleById(cycleId);
  if (!cycle || cycle.phase !== CyclePhase.PRODUCTION) return;

  const allDeliveries = await db
    .select()
    .from(schema.deliveries)
    .where(eq(schema.deliveries.cycleId, cycleId));

  if (allDeliveries.length === 0) {
    await db
      .update(schema.cycles)
      .set({ phase: CyclePhase.REVIEW })
      .where(eq(schema.cycles.id, cycleId));

    await announce(cycle.guildId, rei.announcement("Fase de revisão", messages.noDeliveries()));
    logger.info("Sem entregas. Revisão ignorada.", { cycleId });

    const updated = await getCycleById(cycleId);
    if (updated) {
      await discordScheduledEventService.syncCycleScheduledEvents(updated);
    }

    await maybeCloseReviewCycleIfNoPending(cycleId);
    return;
  }

  await db
    .update(schema.cycles)
    .set({ phase: CyclePhase.REVIEW })
    .where(eq(schema.cycles.id, cycleId));

  const { assignReviewers } = await import("./review.service.js");
  await assignReviewers(cycle.guildId, cycleId);

  await announce(cycle.guildId, rei.announcement("Fase de revisão iniciada", "Entregas atribuídas."));
  logger.info("Fase de revisão iniciada.", { cycleId });

  const updated = await getCycleById(cycleId);
  if (updated) {
    await discordScheduledEventService.syncCycleScheduledEvents(updated);
  }

  await maybeCloseReviewCycleIfNoPending(cycleId);
}

async function sendDailyPendingReviewsReminder(cycleId: number): Promise<void> {
  const cycle = await getCycleById(cycleId);
  if (!cycle || cycle.phase !== CyclePhase.REVIEW) return;

  const { getPendingReviewerCounts } = await import("./review.service.js");
  const pendingReviewers = await getPendingReviewerCounts(cycle.guildId, cycle.id);
  if (pendingReviewers.length === 0) {
    logger.info("Lembrete diário sem pendências de revisão.", {
      cycleId: cycle.id,
      guildId: cycle.guildId,
    });
    return;
  }

  const mentions = pendingReviewers.map((item) => `<@${item.userId}>`).join(" ");
  const pendingAssignments = pendingReviewers.reduce((acc, item) => acc + item.pendingCount, 0);

  await logEvent(cycle.guildId, EventType.REMINDER_SENT, {
    cycleId: cycle.id,
    payload: {
      type: "daily_review_pending",
      pendingReviewers: pendingReviewers.length,
      pendingAssignments,
    },
  });

  await announce(
    cycle.guildId,
    `${mentions}\n${messages.dailyReviewReminder(cycle.cycleNumber, pendingReviewers.length)}`
  );

  logger.info("Lembrete diário de revisões pendentes enviado.", {
    cycleId: cycle.id,
    guildId: cycle.guildId,
    pendingReviewers: pendingReviewers.length,
    pendingAssignments,
  });
}

async function maybeCloseReviewCycleIfNoPending(cycleId: number): Promise<void> {
  const cycle = await getCycleById(cycleId);
  if (!cycle || cycle.phase !== CyclePhase.REVIEW) return;

  const hasPending = await hasPendingReviewAssignments(cycleId);
  if (hasPending) return;

  logger.info("Nenhuma revisão pendente. Encerrando ciclo automaticamente.", {
    cycleId: cycle.id,
    guildId: cycle.guildId,
  });

  await closeCycle(cycleId);
}

async function closeCycle(cycleId: number): Promise<void> {
  const cycle = await getCycleById(cycleId);
  if (!cycle || cycle.phase === CyclePhase.CLOSED) return;

  const hasPendingReviews = await hasPendingReviewAssignments(cycleId);

  await db
    .update(schema.cycles)
    .set({ phase: CyclePhase.CLOSED, closedAt: now() })
    .where(eq(schema.cycles.id, cycleId));

  const { memberService } = await import("./member.service.js");
  const changes = await memberService.evaluateAllMembers(cycle.guildId, cycleId);

  for (const change of changes) {
    const msg =
      change.newState === "observer" ? messages.stateToObserver() : messages.stateToActive();
    await announce(cycle.guildId, rei.stateChange(`<@${change.userId}>: ${msg}`));
  }

  const { generateWeeklyReport } = await import("./report.service.js");
  const reportEmbed = await generateWeeklyReport(cycleId);
  await announce(cycle.guildId, reportEmbed);

  await logEvent(cycle.guildId, EventType.CYCLE_CLOSED, { cycleId });
  await announce(cycle.guildId, rei.announcement(`Ciclo ${cycle.cycleNumber} Encerrado`));
  await discordScheduledEventService.deleteCycleScheduledEvents(cycle.guildId, cycleId);

  if (!hasPendingReviews) {
    const nextCycle = await openCycle(cycle.guildId);
    if (nextCycle) {
      const { rescheduleGuild } = await import("../scheduler/index.js");
      await rescheduleGuild(cycle.guildId);
      logger.info("Novo ciclo iniciado automaticamente.", {
        guildId: cycle.guildId,
        previousCycleId: cycleId,
        newCycleId: nextCycle.id,
      });
    }
  }

  logger.info("Ciclo encerrado.", { cycleId, cycleNumber: cycle.cycleNumber });
}

async function sendReminder(cycleId: number): Promise<void> {
  const cycle = await getCycleById(cycleId);
  if (!cycle || cycle.phase === CyclePhase.CLOSED) return;

  const projects = await db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.cycleId, cycleId));

  const deliveries = await db
    .select()
    .from(schema.deliveries)
    .where(eq(schema.deliveries.cycleId, cycleId));

  const deliveredUserIds = new Set(deliveries.map((d) => d.userId));
  const pending = projects.filter((p) => !deliveredUserIds.has(p.userId)).length;

  await logEvent(cycle.guildId, EventType.REMINDER_SENT, { cycleId, payload: { pending } });
  await announce(cycle.guildId, rei.announcement(`Lembrete -- Ciclo ${cycle.cycleNumber}`,
    `48 horas para encerramento (${formatShort(cycle.reviewDeadline)} de Brasília). ${pending} entregas pendentes.`));
  logger.info("Lembrete enviado.", { cycleId, pending });
}

export const cycleService = {
  getActiveCycle,
  getCycleById,
  getGuildConfig,
  openCycle,
  closeDeclaration,
  startReviewPhase,
  sendDailyPendingReviewsReminder,
  maybeCloseReviewCycleIfNoPending,
  closeCycle,
  sendReminder,
  announce,
};
