import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { memberService } from "../services/member.service.js";
import {
  getAssignmentForUserAndDelivery,
  getReviewByAssignment,
  submitReview,
  getPendingAssignments,
} from "../services/review.service.js";
import { messages } from "../utils/messages.js";
import { CyclePhase } from "../utils/constants.js";
import { requireGuild } from "../utils/permissions.js";

export const review: Command = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Gerenciamento de reviews.")
    .addSubcommand((sub) =>
      sub
        .setName("enviar")
        .setDescription("Submeter review de entrega atribuída.")
        .addIntegerOption((opt) =>
          opt.setName("entrega_id").setDescription("ID da entrega atribuída.").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("conteudo").setDescription("Conteúdo da review.").setRequired(true).setMaxLength(2000)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("pendentes").setDescription("Listar reviews pendentes.")
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: messages.guildOnly(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    await memberService.getOrCreateMember(guildId, userId);

    if (subcommand === "pendentes") {
      const cycle = await cycleService.getActiveCycle(guildId);
      if (!cycle) {
        await interaction.reply({ content: messages.noCycleActive(), flags: [MessageFlags.Ephemeral] });
        return;
      }

      const pending = await getPendingAssignments(guildId, userId, cycle.id);
      if (pending.length === 0) {
        await interaction.reply({ content: "Nenhuma review pendente.", flags: [MessageFlags.Ephemeral] });
        return;
      }

      const lines = pending.map((a) => `- Entrega ID: ${a.deliveryId}`);
      await interaction.reply({
        content: `Reviews pendentes:\n${lines.join("\n")}`,
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // subcommand === "enviar"
    const cycle = await cycleService.getActiveCycle(guildId);
    if (!cycle || cycle.phase !== CyclePhase.REVIEW) {
      await interaction.reply({ content: messages.outsideReviewPeriod(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const entregaId = interaction.options.getInteger("entrega_id", true);
    const conteudo = interaction.options.getString("conteudo", true);

    const assignment = await getAssignmentForUserAndDelivery(userId, entregaId);
    if (!assignment) {
      await interaction.reply({ content: messages.assignmentNotFound(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const existingReview = await getReviewByAssignment(assignment.id);
    if (existingReview) {
      await interaction.reply({ content: messages.reviewAlreadySubmitted(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    await submitReview(assignment, conteudo);

    await interaction.reply({ content: messages.reviewSubmitted(), flags: [MessageFlags.Ephemeral] });
  },
};
