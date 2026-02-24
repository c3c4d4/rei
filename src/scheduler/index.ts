import type { Client } from "discord.js";
import { eq } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { blackholeService } from "../services/blackhole.service.js";
import { projectContractService } from "../services/project-contract.service.js";
import { reviewThreadService } from "../services/review-thread.service.js";
import { dailyStatusDigestService } from "../services/daily-status-digest.service.js";
import { now } from "../utils/time.js";
import { logger } from "../utils/logger.js";

const BLACKHOLE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const monitorIntervals = new Map<string, ReturnType<typeof setInterval>>();
const monitorTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function clearGuildMonitor(guildId: string): void {
  const existingInterval = monitorIntervals.get(guildId);
  if (existingInterval) {
    clearInterval(existingInterval);
    monitorIntervals.delete(guildId);
  }

  const existingTimeout = monitorTimeouts.get(guildId);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    monitorTimeouts.delete(guildId);
  }
}

function msUntilNextHourBoundary(): number {
  const current = new Date();
  const next = new Date(current);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);

  return Math.max(1_000, next.getTime() - current.getTime());
}

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
  clearGuildMonitor(guildId);

  const run = () =>
    Promise.all([
      blackholeService.settleExpiredMembers(guildId),
      projectContractService.settleExpiredContracts(guildId),
      reviewThreadService.settleExpiredReviewDeadlines(guildId),
      dailyStatusDigestService.maybeSendDailyDigest(guildId),
    ]).catch((error) =>
      logger.error("Guild monitor tick failed.", { guildId, error: String(error) })
    );

  run();

  const firstAlignedDelay = msUntilNextHourBoundary();
  const timeout = setTimeout(() => {
    run();
    const interval = setInterval(run, BLACKHOLE_CHECK_INTERVAL_MS);
    monitorIntervals.set(guildId, interval);
    monitorTimeouts.delete(guildId);
  }, firstAlignedDelay);
  monitorTimeouts.set(guildId, timeout);
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
