import { Events } from "discord.js";
import { client } from "../client.js";
import { onboardingService } from "../services/onboarding.service.js";
import { logger } from "../utils/logger.js";

export function registerGuildMemberAddEvent(): void {
  client.on(Events.GuildMemberAdd, async (member) => {
    if (member.user.bot) return;

    try {
      await onboardingService.onboardGuildMember(member);
      logger.info("Member onboarded on join.", {
        guildId: member.guild.id,
        userId: member.id,
      });
    } catch (error) {
      logger.error("Failed to onboard member on join.", {
        guildId: member.guild.id,
        userId: member.id,
        error: String(error),
      });
    }
  });
}
