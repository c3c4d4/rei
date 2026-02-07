import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { projectService } from "../services/project.service.js";
import { deliveryService } from "../services/delivery.service.js";
import { memberService } from "../services/member.service.js";
import { teachbackService } from "../services/teachback.service.js";
import { getPendingAssignments } from "../services/review.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { formatShort } from "../utils/time.js";
import { requireGuild } from "../utils/permissions.js";

export const ciclo: Command = {
  data: new SlashCommandBuilder()
    .setName("ciclo")
    .setDescription("Informacoes do ciclo.")
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
          { name: "Fase", value: cycle.phase, inline: true },
          { name: "Projetos", value: String(projectCount), inline: true },
          { name: "Entregas", value: String(deliveryCount), inline: true },
          { name: "Inicio", value: formatShort(cycle.startedAt), inline: true },
          { name: "Declaracoes", value: `ate ${formatShort(cycle.declarationDeadline)}`, inline: true },
          { name: "Producao", value: `ate ${formatShort(cycle.productionDeadline)}`, inline: true },
          { name: "Review", value: `ate ${formatShort(cycle.reviewDeadline)}`, inline: true },
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
    const teachback = await teachbackService.getByUserAndCycle(guildId, userId, cycle.id);

    const embed = rei.info(`Status no Ciclo ${cycle.cycleNumber}`)
      .addFields(
        { name: "Estado", value: member.state, inline: true },
        { name: "Projeto", value: project ? project.title : "nenhum", inline: true },
        { name: "Entrega", value: hasDelivery ? "sim" : "nao", inline: true },
        { name: "Reviews pendentes", value: String(pendingReviews.length), inline: true },
        { name: "Ensino", value: teachback ? teachback.topic : "nenhum", inline: true },
      );

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
