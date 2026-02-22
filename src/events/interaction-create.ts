import { Events, MessageFlags } from "discord.js";
import { client, commands } from "../client.js";
import { logger } from "../utils/logger.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";

export function registerInteractionCreateEvent(): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error("Command execution failed.", {
        error: String(error),
        command: interaction.commandName,
        user: interaction.user.id,
        guild: interaction.guildId ?? "DM",
      });

      const embed = rei.error(messages.internalError());
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [embed], flags: [MessageFlags.Ephemeral] }).catch(() => {});
      } else {
        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] }).catch(() => {});
      }
    }
  });
}
