import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { projectService } from "../services/project.service.js";
import { deliveryService } from "../services/delivery.service.js";
import { memberService } from "../services/member.service.js";
import { getPendingAssignments } from "../services/review.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { formatShort } from "../utils/time.js";
import { requireGuild } from "../utils/permissions.js";

function formatPhase(phase: string): string {
  const labels: Record<string, string> = {
    declaration: "Declaração",
    production: "Produção",
    review: "Revisão",
    closed: "Encerrado",
  };
  return labels[phase] ?? phase;
}

function formatMemberState(state: string): string {
  const labels: Record<string, string> = {
    active: "Ativo",
    observer: "Observador",
  };
  return labels[state] ?? state;
}

export const ciclo: Command = {
  data: new SlashCommandBuilder()
    .setName("ciclo")
    .setDescription("Informações do ciclo.")
    .addSubcommand((sub) => sub.setName("info").setDescription("Ver ciclo atual."))
    .addSubcommand((sub) => sub.setName("status").setDescription("Ver seu status no ciclo.")),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ embeds: [rei.error(messages.guildOnly())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    await memberService.getOrCreateMember(guildId, userId);

    const cycle = await cycleService.getActiveCycle(guildId);

    if (subcommand === "info") {
      if (!cycle) {
        await interaction.reply({ embeds: [rei.error(messages.noCycleActive())], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const projectCount = (await projectService.getAllForCycle(cycle.id)).length;
      const deliveryCount = (await deliveryService.getAllForCycle(cycle.id)).length;

      const embed = rei.info(`Ciclo ${cycle.cycleNumber}`)
        .addFields(
          { name: "Fase", value: formatPhase(cycle.phase), inline: true },
          { name: "Projetos", value: String(projectCount), inline: true },
          { name: "Entregas", value: String(deliveryCount), inline: true },
          { name: "Início", value: formatShort(cycle.startedAt), inline: true },
          { name: "Declarações", value: `até ${formatShort(cycle.declarationDeadline)} (Brasília)`, inline: true },
          { name: "Produção", value: `até ${formatShort(cycle.productionDeadline)} (Brasília)`, inline: true },
          { name: "Revisão", value: `até ${formatShort(cycle.reviewDeadline)} (Brasília)`, inline: true },
        );

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    // subcommand === "status"
    if (!cycle) {
      await interaction.reply({ embeds: [rei.error(messages.noCycleActive())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const member = await memberService.getOrCreateMember(guildId, userId);
    const project = await projectService.getByUserAndCycle(guildId, userId, cycle.id);
    const hasDelivery = project ? !!(await deliveryService.getByProject(project.id)) : false;
    const pendingReviews = await getPendingAssignments(guildId, userId, cycle.id);

    const embed = rei.info(`Status no Ciclo ${cycle.cycleNumber}`)
      .addFields(
        { name: "Estado", value: formatMemberState(member.state), inline: true },
        { name: "Projeto", value: project ? project.title : "nenhum", inline: true },
        { name: "Entrega", value: hasDelivery ? "sim" : "não", inline: true },
        { name: "Revisões pendentes", value: String(pendingReviews.length), inline: true },
      );

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
