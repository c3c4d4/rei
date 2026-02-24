import type { Guild, SendableChannels } from "discord.js";
import { and, desc, eq } from "drizzle-orm";
import { client } from "../client.js";
import { db, schema } from "../db/index.js";
import { rei } from "../utils/embeds.js";
import { logger } from "../utils/logger.js";
import { now } from "../utils/time.js";
import { memberService } from "./member.service.js";
import { projectContractService } from "./project-contract.service.js";

const DAILY_DIGEST_KIND = "daily_blackhole_status";
const DAILY_DIGEST_HOUR = 12;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const CHUNK_DESCRIPTION_LIMIT = 3600;
const MAX_PROJECT_TITLE_LENGTH = 70;

type LocalTimeParts = {
  dateKey: string;
  hour: number;
};

type ReportPayload = {
  kind?: string;
  localDate?: string;
};

type MemberDigestLine = {
  daysLeft: number;
  line: string;
};

function getPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes
): string {
  const value = parts.find((part) => part.type === type)?.value;
  if (!value) {
    throw new Error(`Missing date part: ${type}`);
  }
  return value;
}

function getLocalTimeParts(date: Date, timezone: string): LocalTimeParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const year = getPart(parts, "year");
  const month = getPart(parts, "month");
  const day = getPart(parts, "day");
  const hourRaw = Number(getPart(parts, "hour"));
  if (!Number.isFinite(hourRaw)) {
    throw new Error(`Invalid hour in local time parts for timezone ${timezone}`);
  }

  return {
    dateKey: `${year}-${month}-${day}`,
    hour: hourRaw,
  };
}

function daysRemaining(isoDate: string): number {
  const remainingMs = new Date(isoDate).getTime() - Date.now();
  if (remainingMs <= 0) return 0;
  return Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
}

function trimText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

function chunkLines(lines: string[], maxChunkLength: number): string[] {
  if (lines.length === 0) return [];

  const chunks: string[] = [];
  let current = "";

  for (const originalLine of lines) {
    const line = trimText(originalLine, maxChunkLength);
    const next = current.length === 0 ? line : `${current}\n${line}`;
    if (next.length <= maxChunkLength) {
      current = next;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
    }
    current = line;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function parseReportPayload(raw: string | null): ReportPayload | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;

    const record = parsed as Record<string, unknown>;
    return {
      kind: typeof record.kind === "string" ? record.kind : undefined,
      localDate: typeof record.localDate === "string" ? record.localDate : undefined,
    };
  } catch {
    return null;
  }
}

async function hasDigestForDate(guildId: string, localDate: string): Promise<boolean> {
  const recentReports = await db
    .select({ payload: schema.eventsLog.payload })
    .from(schema.eventsLog)
    .where(
      and(
        eq(schema.eventsLog.guildId, guildId),
        eq(schema.eventsLog.eventType, "report_generated")
      )
    )
    .orderBy(desc(schema.eventsLog.createdAt))
    .limit(40);

  for (const row of recentReports) {
    const payload = parseReportPayload(row.payload);
    if (!payload) continue;
    if (payload.kind !== DAILY_DIGEST_KIND) continue;
    if (payload.localDate === localDate) return true;
  }

  return false;
}

async function resolveGuildAndChannel(
  guildId: string,
  channelId: string
): Promise<{ guild: Guild; channel: SendableChannels } | null> {
  const guild =
    client.guilds.cache.get(guildId) ??
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return null;

  const channel =
    guild.channels.cache.get(channelId) ??
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel || !channel.isSendable()) return null;

  return { guild, channel };
}

async function buildMemberLines(guildId: string): Promise<MemberDigestLine[]> {
  const members = await memberService.getAllMembers(guildId);
  const lines: MemberDigestLine[] = [];

  for (const member of members) {
    const daysLeft = daysRemaining(member.blackholeDeadline);

    const openProject = await projectContractService.getOpenContractForUser(guildId, member.userId);
    const deliveredProject = openProject
      ? undefined
      : await projectContractService.getDeliveredContractForUser(guildId, member.userId);

    let projectState = "Idle";
    if (openProject) {
      projectState = `Working: ${trimText(openProject.title, MAX_PROJECT_TITLE_LENGTH)}`;
    } else if (deliveredProject) {
      projectState = `Waiting review: ${trimText(
        deliveredProject.title,
        MAX_PROJECT_TITLE_LENGTH
      )}`;
    }

    lines.push({
      daysLeft,
      line: `<@${member.userId}> | ${daysLeft} day(s) left | ${projectState}`,
    });
  }

  return lines.sort((a, b) => {
    if (a.daysLeft !== b.daysLeft) return a.daysLeft - b.daysLeft;
    return a.line.localeCompare(b.line);
  });
}

async function postDailyDigest(guildId: string): Promise<void> {
  const configRows = await db
    .select({
      announcementChannelId: schema.guilds.announcementChannelId,
      timezone: schema.guilds.timezone,
    })
    .from(schema.guilds)
    .where(eq(schema.guilds.guildId, guildId))
    .limit(1);
  const config = configRows[0];
  if (!config?.announcementChannelId) return;

  const timezone = config.timezone ?? DEFAULT_TIMEZONE;
  const localNow = getLocalTimeParts(new Date(), timezone);
  if (localNow.hour < DAILY_DIGEST_HOUR) return;

  if (await hasDigestForDate(guildId, localNow.dateKey)) return;

  const resolved = await resolveGuildAndChannel(guildId, config.announcementChannelId);
  if (!resolved) {
    logger.warn("Daily digest skipped: announcement channel unavailable.", {
      guildId,
      channelId: config.announcementChannelId,
    });
    return;
  }

  const memberLines = await buildMemberLines(resolved.guild.id);
  const printableLines =
    memberLines.length > 0
      ? memberLines.map((entry) => entry.line)
      : ["No human members found."];
  const chunks = chunkLines(printableLines, CHUNK_DESCRIPTION_LIMIT);

  for (let index = 0; index < chunks.length; index++) {
    const partLabel = chunks.length > 1 ? ` | Page ${index + 1}/${chunks.length}` : "";
    const title = `Daily Midday Status${partLabel}`;
    const description =
      index === 0
        ? `Blackhole countdown and project activity (${timezone}).\n\n${chunks[index]}`
        : chunks[index];

    await resolved.channel.send({
      embeds: [rei.announcement(title, description)],
      allowedMentions: { parse: [] },
    });
  }

  const timestamp = now();
  await db.insert(schema.eventsLog).values({
    guildId,
    cycleId: null,
    userId: null,
    eventType: "report_generated",
    payload: JSON.stringify({
      kind: DAILY_DIGEST_KIND,
      localDate: localNow.dateKey,
      timezone,
      membersReported: memberLines.length,
      chunksSent: chunks.length,
      sentAt: timestamp,
    }),
    createdAt: timestamp,
  });

  logger.info("Daily digest posted.", {
    guildId,
    localDate: localNow.dateKey,
    timezone,
    membersReported: memberLines.length,
    chunksSent: chunks.length,
  });
}

async function maybeSendDailyDigest(guildId: string): Promise<void> {
  try {
    await postDailyDigest(guildId);
  } catch (error) {
    logger.error("Failed to post daily digest.", { guildId, error: String(error) });
  }
}

export const dailyStatusDigestService = {
  maybeSendDailyDigest,
};
