import { Events } from "discord.js";
import { client } from "../client.js";
import { runMigrations } from "../db/migrate.js";
import { logger } from "../utils/logger.js";
import { initScheduler } from "../scheduler/index.js";
import { onboardingService } from "../services/onboarding.service.js";

export function registerReadyEvent(): void {
  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`REI online. ${readyClient.user.tag}`);

    await runMigrations();

    await initScheduler(readyClient);

    for (const [, guild] of readyClient.guilds.cache) {
      await onboardingService.onboardGuildMembers(guild);
    }
  });
}
