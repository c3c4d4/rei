import type { Client } from "discord.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { scheduler } from "./scheduler.js";
import { cycleService } from "../services/cycle.service.js";
import { CyclePhase } from "../utils/constants.js";
import { isPast, addHours } from "../utils/time.js";
import { logger } from "../utils/logger.js";
import { now } from "../utils/time.js";

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
    logger.info("Recuperando: fechando declaracao atrasada.", { guildId, cycleId: cycle.id });
    await cycleService.closeDeclaration(cycle.id);
  }

  const current = await cycleService.getCycleById(cycle.id);
  if (!current || current.phase === CyclePhase.CLOSED) return;

  if (current.phase === CyclePhase.PRODUCTION && isPast(current.productionDeadline)) {
    logger.info("Recuperando: iniciando review atrasada.", { guildId, cycleId: cycle.id });
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
