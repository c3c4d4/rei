import { Events, MessageFlags } from "discord.js";
import { client, commands } from "../client.js";
import { logger } from "../utils/logger.js";
import { messages } from "../utils/messages.js";

export function registerInteractionCreateEvent(): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      logger.error("Falha na execucao do comando.", {
        error: String(error),
        command: interaction.commandName,
        user: interaction.user.id,
        guild: interaction.guildId ?? "DM",
      });

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: messages.internalError(), flags: [MessageFlags.Ephemeral] }).catch(() => {});
      } else {
        await interaction.reply({ content: messages.internalError(), flags: [MessageFlags.Ephemeral] }).catch(() => {});
      }
    }
  });
}
