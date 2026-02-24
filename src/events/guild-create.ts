import { Events } from "discord.js";
import { client } from "../client.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { now } from "../utils/time.js";
import { logger } from "../utils/logger.js";
import { rescheduleGuild } from "../scheduler/index.js";
import { onboardingService } from "../services/onboarding.service.js";

export function registerGuildCreateEvent(): void {
  client.on(Events.GuildCreate, async (guild) => {
    const rows = await db
      .select()
      .from(schema.guilds)
      .where(eq(schema.guilds.guildId, guild.id));

    if (rows.length === 0) {
      await db.insert(schema.guilds).values({ guildId: guild.id, createdAt: now() });
      logger.info("Guild registered.", { guildId: guild.id });
    }

    await rescheduleGuild(guild.id);
    await onboardingService.onboardGuildMembers(guild);
  });
}
