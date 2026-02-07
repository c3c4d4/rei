import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { projectService } from "../services/project.service.js";
import { memberService } from "../services/member.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { CyclePhase, MemberState } from "../utils/constants.js";
import { requireGuild } from "../utils/permissions.js";

export const projeto: Command = {
  data: new SlashCommandBuilder()
    .setName("projeto")
    .setDescription("Gerenciamento de projetos.")
    .addSubcommand((sub) =>
      sub
        .setName("declarar")
        .setDescription("Declarar projeto para o ciclo atual.")
        .addStringOption((opt) =>
          opt.setName("titulo").setDescription("Titulo do projeto.").setRequired(true).setMaxLength(100)
        )
        .addStringOption((opt) =>
          opt.setName("descricao").setDescription("Descricao breve.").setRequired(true).setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt.setName("artefato").setDescription("Artefato esperado.").setRequired(true).setMaxLength(200)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("listar").setDescription("Listar projetos do ciclo atual.")
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ embeds: [rei.error(messages.guildOnly())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === "listar") {
      const cycle = await cycleService.getActiveCycle(guildId);
      if (!cycle) {
        await interaction.reply({ embeds: [rei.error(messages.noCycleActive())], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const projects = await projectService.getAllForCycle(cycle.id);
      if (projects.length === 0) {
        await interaction.reply({
          embeds: [rei.info(`Projetos -- Ciclo ${cycle.cycleNumber}`, "Nenhum projeto declarado neste ciclo.")],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const embed = rei.info(`Projetos -- Ciclo ${cycle.cycleNumber}`, `${projects.length} projetos declarados.`);
      for (const p of projects) {
        embed.addFields({
          name: `<@${p.userId}>`,
          value: `**${p.title}**\n${p.description}\nArtefato: ${p.expectedArtifact}`,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    // subcommand === "declarar"
    const member = await memberService.getOrCreateMember(guildId, userId);
    if (member.state !== MemberState.ACTIVE) {
      await interaction.reply({ embeds: [rei.error(messages.observerCannotDeclare())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const cycle = await cycleService.getActiveCycle(guildId);
    if (!cycle || cycle.phase !== CyclePhase.DECLARATION) {
      await interaction.reply({ embeds: [rei.error(messages.outsideDeclarationPeriod())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const existing = await projectService.getByUserAndCycle(guildId, userId, cycle.id);
    if (existing) {
      await interaction.reply({ embeds: [rei.error(messages.projectAlreadyDeclared())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const titulo = interaction.options.getString("titulo", true);
    const descricao = interaction.options.getString("descricao", true);
    const artefato = interaction.options.getString("artefato", true);

    await projectService.declare(guildId, userId, cycle.id, titulo, descricao, artefato);

    await interaction.reply({ embeds: [rei.success(messages.projectDeclared(titulo))], flags: [MessageFlags.Ephemeral] });
  },
};
