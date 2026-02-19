import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { projectService } from "../services/project.service.js";
import { deliveryService } from "../services/delivery.service.js";
import { memberService } from "../services/member.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
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
          opt.setName("arquivo1").setDescription("Arquivo do artefato.").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("arquivo2").setDescription("Segundo arquivo (opcional).").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("arquivo3").setDescription("Terceiro arquivo (opcional).").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("arquivo4").setDescription("Quarto arquivo (opcional).").setRequired(false)
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

    const link = interaction.options.getString("link");
    const attachments = [
      interaction.options.getAttachment("arquivo1"),
      interaction.options.getAttachment("arquivo2"),
      interaction.options.getAttachment("arquivo3"),
      interaction.options.getAttachment("arquivo4"),
    ].filter((a): a is NonNullable<typeof a> => a !== null);

    if (!link && attachments.length === 0) {
      await interaction.reply({ embeds: [rei.error(messages.provideInput())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const cycle = await cycleService.getActiveCycle(guildId);
    if (!cycle || cycle.phase !== CyclePhase.PRODUCTION) {
      await interaction.reply({ embeds: [rei.error(messages.outsideProductionPeriod())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const project = await projectService.getByUserAndCycle(guildId, userId, cycle.id);
    if (!project) {
      await interaction.reply({ embeds: [rei.error(messages.noProjectDeclared())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const existing = await deliveryService.getByProject(project.id);
    if (existing) {
      await interaction.reply({ embeds: [rei.error(messages.deliveryAlreadySubmitted())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const attachmentUrls = attachments.map((a) => a.url);
    await deliveryService.submit(
      guildId,
      userId,
      cycle.id,
      project.id,
      link,
      attachmentUrls.length > 0 ? attachmentUrls : null
    );

    await interaction.reply({ embeds: [rei.success(messages.deliverySubmitted())], flags: [MessageFlags.Ephemeral] });
  },
};
