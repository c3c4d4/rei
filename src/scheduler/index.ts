import type { Client } from "discord.js";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { blackholeService } from "../services/blackhole.service.js";
import { projectContractService } from "../services/project-contract.service.js";
import { reviewThreadService } from "../services/review-thread.service.js";
import { now } from "../utils/time.js";
import { logger } from "../utils/logger.js";

const BLACKHOLE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const monitorIntervals = new Map<string, ReturnType<typeof setInterval>>();

async function ensureGuildRegistered(guildId: string): Promise<void> {
  const rows = await db
    .select({ guildId: schema.guilds.guildId })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId))
    .limit(1);

  if (rows.length === 0) {
    await db.insert(schema.guilds).values({ guildId, createdAt: now() });
  }
}

function startGuildMonitor(guildId: string): void {
  const existing = monitorIntervals.get(guildId);
  if (existing) clearInterval(existing);

  const run = () =>
    Promise.all([
      blackholeService.settleExpiredMembers(guildId),
      projectContractService.settleExpiredContracts(guildId),
      reviewThreadService.settleExpiredReviewDeadlines(guildId),
    ]).catch((error) =>
      logger.error("Guild monitor tick failed.", { guildId, error: String(error) })
    );

  run();

  const interval = setInterval(run, BLACKHOLE_CHECK_INTERVAL_MS);
  monitorIntervals.set(guildId, interval);
}

export async function initScheduler(client: Client<true>): Promise<void> {
  logger.info("Initializing monitors...");

  for (const [guildId] of client.guilds.cache) {
    await ensureGuildRegistered(guildId);
    startGuildMonitor(guildId);
  }

  logger.info("Monitors initialized.");
}

export async function rescheduleGuild(guildId: string): Promise<void> {
  await ensureGuildRegistered(guildId);
  startGuildMonitor(guildId);
}
