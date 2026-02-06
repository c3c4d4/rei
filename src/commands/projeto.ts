import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { cycleService } from "../services/cycle.service.js";
import { projectService } from "../services/project.service.js";
import { memberService } from "../services/member.service.js";
import { messages } from "../utils/messages.js";
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
          opt.setName("titulo").setDescription("Título do projeto.").setRequired(true).setMaxLength(100)
        )
        .addStringOption((opt) =>
          opt.setName("descricao").setDescription("Descrição breve.").setRequired(true).setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt.setName("artefato").setDescription("Artefato esperado.").setRequired(true).setMaxLength(200)
        )
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ content: messages.guildOnly(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    const member = await memberService.getOrCreateMember(guildId, userId);
    if (member.state !== MemberState.ACTIVE) {
      await interaction.reply({ content: messages.observerCannotDeclare(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const cycle = await cycleService.getActiveCycle(guildId);
    if (!cycle || cycle.phase !== CyclePhase.DECLARATION) {
      await interaction.reply({ content: messages.outsideDeclarationPeriod(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const existing = await projectService.getByUserAndCycle(guildId, userId, cycle.id);
    if (existing) {
      await interaction.reply({ content: messages.projectAlreadyDeclared(), flags: [MessageFlags.Ephemeral] });
      return;
    }

    const titulo = interaction.options.getString("titulo", true);
    const descricao = interaction.options.getString("descricao", true);
    const artefato = interaction.options.getString("artefato", true);

    await projectService.declare(guildId, userId, cycle.id, titulo, descricao, artefato);

    await interaction.reply({ content: messages.projectDeclared(titulo), flags: [MessageFlags.Ephemeral] });
  },
};
