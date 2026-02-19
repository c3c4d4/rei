import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { memberService } from "../services/member.service.js";
import {
  getAssignmentForUserAndDelivery,
  getReviewByAssignment,
  submitReview,
  getPendingAssignments,
  getReceivedReviews,
} from "../services/review.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { CyclePhase } from "../utils/constants.js";
import { requireGuild } from "../utils/permissions.js";

export const review: Command = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Gerenciamento de revisões.")
    .addSubcommand((sub) =>
      sub
        .setName("enviar")
        .setDescription("Enviar revisão de entrega atribuída.")
        .addIntegerOption((opt) =>
          opt.setName("entrega_id").setDescription("ID da entrega atribuída.").setRequired(true)
        )
        .addStringOption((opt) =>
          opt.setName("conteudo").setDescription("Conteúdo da revisão.").setRequired(true).setMaxLength(2000)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("pendentes").setDescription("Listar revisões pendentes.")
    )
    .addSubcommand((sub) =>
      sub.setName("recebidas").setDescription("Ver revisões recebidas sobre sua entrega.")
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ embeds: [rei.error(messages.guildOnly())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    await memberService.getOrCreateMember(guildId, userId);

    if (subcommand === "recebidas") {
      const cycle = await cycleService.getActiveCycle(guildId);
      if (!cycle) {
        await interaction.reply({ embeds: [rei.error(messages.noCycleActive())], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const reviews = await getReceivedReviews(guildId, userId, cycle.id);
      if (reviews.length === 0) {
        await interaction.reply({
          embeds: [rei.info("Revisões Recebidas", "Nenhuma revisão recebida ainda.")],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const embeds = [rei.info("Revisões Recebidas", `${reviews.length} revisão(ões) sobre sua entrega.`)];
      for (let i = 0; i < reviews.length; i++) {
        embeds.push(
          rei.info(`Revisão ${i + 1}`).setDescription(reviews[i].content)
        );
      }

      await interaction.reply({ embeds, flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (subcommand === "pendentes") {
      const cycle = await cycleService.getActiveCycle(guildId);
      if (!cycle) {
        await interaction.reply({ embeds: [rei.error(messages.noCycleActive())], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const pending = await getPendingAssignments(guildId, userId, cycle.id);
      if (pending.length === 0) {
        await interaction.reply({
          embeds: [rei.info("Revisões Pendentes", "Nenhuma revisão pendente.")],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const embeds = [rei.info("Revisões Pendentes", `${pending.length} entrega(s) para revisar.`)];
      for (const { assignment, delivery, project } of pending) {
        const lines: string[] = [
          `**Projeto:** ${project.title}`,
          `**Descrição:** ${project.description}`,
          `**Artefato esperado:** ${project.expectedArtifact}`,
        ];
        if (delivery.link) lines.push(`**Link:** ${delivery.link}`);
        if (delivery.attachmentUrl) {
          try {
            const urls: string[] = JSON.parse(delivery.attachmentUrl);
            urls.forEach((url, i) => lines.push(`**Anexo ${urls.length > 1 ? i + 1 : ""}:** ${url}`));
          } catch {
            lines.push(`**Anexo:** ${delivery.attachmentUrl}`);
          }
        }

        embeds.push(
          rei.info(`Entrega ${delivery.id}`).setDescription(lines.join("\n"))
            .setFooter({ text: `Use /review enviar entrega_id:${delivery.id} conteudo:<sua revisão>` })
        );
      }

      await interaction.reply({ embeds, flags: [MessageFlags.Ephemeral] });
      return;
    }

    // subcommand === "enviar"
    const cycle = await cycleService.getActiveCycle(guildId);
    if (!cycle || cycle.phase !== CyclePhase.REVIEW) {
      await interaction.reply({ embeds: [rei.error(messages.outsideReviewPeriod())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const entregaId = interaction.options.getInteger("entrega_id", true);
    const conteudo = interaction.options.getString("conteudo", true);

    const assignment = await getAssignmentForUserAndDelivery(guildId, cycle.id, userId, entregaId);
    if (!assignment) {
      await interaction.reply({ embeds: [rei.error(messages.assignmentNotFound())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const existingReview = await getReviewByAssignment(assignment.id);
    if (existingReview) {
      await interaction.reply({ embeds: [rei.error(messages.reviewAlreadySubmitted())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    await submitReview(assignment, conteudo);

    await interaction.reply({ embeds: [rei.success(messages.reviewSubmitted())], flags: [MessageFlags.Ephemeral] });
  },
};
