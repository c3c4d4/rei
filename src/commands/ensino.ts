import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { teachbackService } from "../services/teachback.service.js";
import { memberService } from "../services/member.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { CyclePhase } from "../utils/constants.js";
import { requireGuild } from "../utils/permissions.js";

export const ensino: Command = {
  data: new SlashCommandBuilder()
    .setName("ensino")
    .setDescription("Gerenciamento de ensino.")
    .addSubcommand((sub) =>
      sub
        .setName("registrar")
        .setDescription("Registrar micro-explicacao.")
        .addStringOption((opt) =>
          opt.setName("topico").setDescription("Topico da explicacao.").setRequired(true).setMaxLength(100)
        )
        .addStringOption((opt) =>
          opt.setName("conteudo").setDescription("Conteudo da explicacao.").setRequired(true).setMaxLength(2000)
        )
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ embeds: [rei.error(messages.guildOnly())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    await memberService.getOrCreateMember(guildId, userId);

    const cycle = await cycleService.getActiveCycle(guildId);
    if (!cycle || cycle.phase === CyclePhase.CLOSED) {
      await interaction.reply({ embeds: [rei.error(messages.noCycleActive())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (cycle.phase !== CyclePhase.PRODUCTION && cycle.phase !== CyclePhase.REVIEW) {
      await interaction.reply({ embeds: [rei.error(messages.outsideProductionOrReview())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const existing = await teachbackService.getByUserAndCycle(guildId, userId, cycle.id);
    if (existing) {
      await interaction.reply({ embeds: [rei.error(messages.teachbackAlreadyRegistered())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const topico = interaction.options.getString("topico", true);
    const conteudo = interaction.options.getString("conteudo", true);

    await teachbackService.register(guildId, userId, cycle.id, topico, conteudo);

    await interaction.reply({ embeds: [rei.success(messages.teachbackRegistered(topico))], flags: [MessageFlags.Ephemeral] });
  },
};
