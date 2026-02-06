import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { projectService } from "../services/project.service.js";
import { deliveryService } from "../services/delivery.service.js";
import { memberService } from "../services/member.service.js";
import { messages } from "../utils/messages.js";
import { CyclePhase } from "../utils/constants.js";
import { requireGuild } from "../utils/permissions.js";

export const entrega: Command = {
  data: new SlashCommandBuilder()
    .setName("entrega")
    .setDescription("Gerenciamento de entregas.")
    .addSubcommand((sub) =>
      sub
        .setName("submeter")
        .setDescription("Submeter entrega do projeto.")
        .addStringOption((opt) =>
          opt.setName("link").setDescription("Link para o artefato.").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("arquivo").setDescription("Arquivo do artefato.").setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: messages.guildOnly(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    await memberService.getOrCreateMember(guildId, userId);

    const link = interaction.options.getString("link");
    const arquivo = interaction.options.getAttachment("arquivo");

    if (!link && !arquivo) {
      await interaction.reply({ content: messages.provideInput(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const cycle = await cycleService.getActiveCycle(guildId);
    if (!cycle || cycle.phase !== CyclePhase.PRODUCTION) {
      await interaction.reply({ content: messages.outsideProductionPeriod(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const project = await projectService.getByUserAndCycle(guildId, userId, cycle.id);
    if (!project) {
      await interaction.reply({ content: messages.noProjectDeclared(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const existing = await deliveryService.getByProject(project.id);
    if (existing) {
      await interaction.reply({ content: messages.deliveryAlreadySubmitted(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    await deliveryService.submit(
      guildId,
      userId,
      cycle.id,
      project.id,
      link,
      arquivo?.url ?? null
    );

    await interaction.reply({ content: messages.deliverySubmitted(), flags: [MessageFlags.Ephemeral] });
  },
};
