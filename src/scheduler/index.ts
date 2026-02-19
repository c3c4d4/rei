import type { Client } from "discord.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { scheduler } from "./scheduler.js";
import { cycleService } from "../services/cycle.service.js";
import { CyclePhase } from "../utils/constants.js";
import { isPast, addHours } from "../utils/time.js";
import { logger } from "../utils/logger.js";
import { now } from "../utils/time.js";
import { discordScheduledEventService } from "../services/discord-scheduled-event.service.js";

const BRASILIA_UTC_OFFSET_HOURS = 3;
const DAILY_REVIEW_REMINDER_HOUR_BRASILIA = 16;

function getBrasiliaDateFromUtc(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((part) => part.type === "year")?.value ?? "0");
  const month = Number(parts.find((part) => part.type === "month")?.value ?? "0");
  const day = Number(parts.find((part) => part.type === "day")?.value ?? "0");
  return { year, month, day };
}

function brasiliaWallClockToUtcIso(
  year: number,
  month: number,
  day: number,
  hour: number
): string {
  return new Date(
    Date.UTC(year, month - 1, day, hour + BRASILIA_UTC_OFFSET_HOURS, 0, 0, 0)
  ).toISOString();
}

function scheduleDailyReviewReminders(guildId: string, cycle: typeof schema.cycles.$inferSelect): void {
  const reviewStart = new Date(cycle.productionDeadline);
  const reviewEnd = new Date(cycle.reviewDeadline);
  const startDate = getBrasiliaDateFromUtc(reviewStart);
  const cursor = new Date(Date.UTC(startDate.year, startDate.month - 1, startDate.day));
  let reminderIndex = 1;

  while (true) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;
    const day = cursor.getUTCDate();
    const reminderIso = brasiliaWallClockToUtcIso(
      year,
      month,
      day,
      DAILY_REVIEW_REMINDER_HOUR_BRASILIA
    );

    if (new Date(reminderIso).getTime() >= reviewEnd.getTime()) {
      break;
    }

    if (!isPast(reminderIso)) {
      scheduler.scheduleAt(guildId, `review_daily_pending_${reminderIndex}`, reminderIso, () =>
        cycleService.sendDailyPendingReviewsReminder(cycle.id)
      );
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
    reminderIndex++;
  }
}

function scheduleCycleTransitions(guildId: string, cycle: typeof schema.cycles.$inferSelect): void {
  const phase = cycle.phase;

  if (phase === CyclePhase.DECLARATION) {
    scheduler.scheduleAt(guildId, "declaration_close", cycle.declarationDeadline, () =>
      cycleService.closeDeclaration(cycle.id)
    );
  }

  if (phase === CyclePhase.DECLARATION || phase === CyclePhase.PRODUCTION) {
    scheduler.scheduleAt(guildId, "review_start", cycle.productionDeadline, () =>
      cycleService.startReviewPhase(cycle.id)
    );

    const reminderTime = addHours(new Date(cycle.reviewDeadline), -48).toISOString();
    scheduler.scheduleAt(guildId, "reminder", reminderTime, () =>
      cycleService.sendReminder(cycle.id)
    );
  }

  if (phase !== CyclePhase.CLOSED) {
    scheduleDailyReviewReminders(guildId, cycle);

    scheduler.scheduleAt(guildId, "cycle_close", cycle.reviewDeadline, () =>
      cycleService.closeCycle(cycle.id)
    );
  }
}

async function recoverGuild(guildId: string): Promise<void> {
  const cycle = await cycleService.getActiveCycle(guildId);

  if (!cycle) {
    logger.info("Nenhum ciclo ativo para recuperar.", { guildId });
    return;
  }

  if (cycle.phase === CyclePhase.DECLARATION && isPast(cycle.declarationDeadline)) {
    logger.info("Recuperando: fechando declaração atrasada.", { guildId, cycleId: cycle.id });
    await cycleService.closeDeclaration(cycle.id);
  }

  const current = await cycleService.getCycleById(cycle.id);
  if (!current || current.phase === CyclePhase.CLOSED) return;

  if (current.phase === CyclePhase.PRODUCTION && isPast(current.productionDeadline)) {
    logger.info("Recuperando: iniciando revisão atrasada.", { guildId, cycleId: cycle.id });
    await cycleService.startReviewPhase(cycle.id);
  }

  const updated = await cycleService.getCycleById(cycle.id);
  if (!updated || updated.phase === CyclePhase.CLOSED) return;

  if (isPast(updated.reviewDeadline)) {
    logger.info("Recuperando: fechando ciclo atrasado.", { guildId, cycleId: cycle.id });
    await cycleService.closeCycle(cycle.id);
    return;
  }

  scheduleCycleTransitions(guildId, updated);
  await discordScheduledEventService.syncCycleScheduledEvents(updated);
}

export async function initScheduler(client: Client<true>): Promise<void> {
  logger.info("Inicializando scheduler...");

  for (const [guildId] of client.guilds.cache) {
    const rows = await db
      .select()
      .from(schema.guilds)
      .where(eq(schema.guilds.guildId, guildId));

    if (rows.length === 0) {
      await db.insert(schema.guilds).values({ guildId, createdAt: now() });
    }

    await recoverGuild(guildId);
  }

  logger.info("Scheduler inicializado.");
}

export async function rescheduleGuild(guildId: string): Promise<void> {
  scheduler.cancelGuildJobs(guildId);
  await recoverGuild(guildId);
}
