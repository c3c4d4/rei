import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { projectService } from "../services/project.service.js";
import { deliveryService } from "../services/delivery.service.js";
import { memberService } from "../services/member.service.js";
import { teachbackService } from "../services/teachback.service.js";
import { getPendingAssignments } from "../services/review.service.js";
import { messages } from "../utils/messages.js";
import { formatShort } from "../utils/time.js";
import { requireGuild } from "../utils/permissions.js";

export const ciclo: Command = {
  data: new SlashCommandBuilder()
    .setName("ciclo")
    .setDescription("Informações do ciclo.")
    .addSubcommand((sub) => sub.setName("info").setDescription("Ver ciclo atual."))
    .addSubcommand((sub) => sub.setName("status").setDescription("Ver seu status no ciclo.")),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: messages.guildOnly(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    await memberService.getOrCreateMember(guildId, userId);

    const cycle = await cycleService.getActiveCycle(guildId);

    if (subcommand === "info") {
      if (!cycle) {
        await interaction.reply({ content: messages.noCycleActive(), flags: [MessageFlags.Ephemeral] });
        return;
      }

      const projectCount = (await projectService.getAllForCycle(cycle.id)).length;
      const deliveryCount = (await deliveryService.getAllForCycle(cycle.id)).length;

      const lines = [
        `Ciclo ${cycle.cycleNumber}`,
        `Fase: ${cycle.phase}`,
        `Início: ${formatShort(cycle.startedAt)}`,
        `Declarações até: ${formatShort(cycle.declarationDeadline)}`,
        `Produção até: ${formatShort(cycle.productionDeadline)}`,
        `Review até: ${formatShort(cycle.reviewDeadline)}`,
        `Projetos: ${projectCount}`,
        `Entregas: ${deliveryCount}`,
      ];

      await interaction.reply({ content: lines.join("\n"), flags: [MessageFlags.Ephemeral] });
      return;
    }

    // subcommand === "status"
    if (!cycle) {
      await interaction.reply({ content: messages.noCycleActive(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const member = await memberService.getOrCreateMember(guildId, userId);
    const project = await projectService.getByUserAndCycle(guildId, userId, cycle.id);
    const hasDelivery = project ? !!(await deliveryService.getByProject(project.id)) : false;
    const pendingReviews = await getPendingAssignments(guildId, userId, cycle.id);
    const teachback = await teachbackService.getByUserAndCycle(guildId, userId, cycle.id);

    const lines = [
      `Estado: ${member.state}`,
      `Projeto: ${project ? project.title : "nenhum"}`,
      `Entrega: ${hasDelivery ? "sim" : "não"}`,
      `Reviews pendentes: ${pendingReviews.length}`,
      `Ensino: ${teachback ? teachback.topic : "nenhum"}`,
    ];

    await interaction.reply({ content: lines.join("\n"), flags: [MessageFlags.Ephemeral] });
  },
};
