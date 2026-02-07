import { SlashCommandBuilder, ChannelType, AttachmentBuilder, MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../types/commands.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { cycleService } from "../services/cycle.service.js";
import { memberService } from "../services/member.service.js";
import { generateMonthlyExport } from "../services/export.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { EventType } from "../utils/constants.js";
import { logEvent } from "../services/event-log.service.js";
import { requireGuild, requireAdmin } from "../utils/permissions.js";
import { rescheduleGuild } from "../scheduler/index.js";

export const admin: Command = {
  data: new SlashCommandBuilder()
    .setName("rei")
    .setDescription("Comandos administrativos REI.")
    .addSubcommandGroup((group) =>
      group
        .setName("config")
        .setDescription("Configuracoes do servidor.")
        .addSubcommand((sub) =>
          sub
            .setName("canal")
            .setDescription("Definir canal de anuncios.")
            .addChannelOption((opt) =>
              opt
                .setName("canal")
                .setDescription("Canal de texto.")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("duracao")
            .setDescription("Definir duracao do ciclo em dias.")
            .addIntegerOption((opt) =>
              opt.setName("dias").setDescription("Dias.").setRequired(true).setMinValue(3).setMaxValue(30)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("declaracao")
            .setDescription("Definir prazo de declaracao em horas.")
            .addIntegerOption((opt) =>
              opt.setName("horas").setDescription("Horas.").setRequired(true).setMinValue(6).setMaxValue(72)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("review")
            .setDescription("Definir periodo de review em horas.")
            .addIntegerOption((opt) =>
              opt.setName("horas").setDescription("Horas.").setRequired(true).setMinValue(12).setMaxValue(96)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("roles")
            .setDescription("Definir roles de ativo e observador.")
            .addRoleOption((opt) =>
              opt.setName("ativo").setDescription("Role para membros ativos.").setRequired(true)
            )
            .addRoleOption((opt) =>
              opt.setName("observador").setDescription("Role para observadores.").setRequired(true)
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("export")
        .setDescription("Exportar registro mensal.")
        .addIntegerOption((opt) =>
          opt.setName("mes").setDescription("Mes (1-12).").setRequired(true).setMinValue(1).setMaxValue(12)
        )
        .addIntegerOption((opt) =>
          opt.setName("ano").setDescription("Ano.").setRequired(true).setMinValue(2024).setMaxValue(2030)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("estado")
        .setDescription("Ver estado de um membro.")
        .addUserOption((opt) =>
          opt.setName("usuario").setDescription("Usuario.").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("forcar-ciclo").setDescription("Forcar abertura de novo ciclo.")
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ embeds: [rei.error(messages.guildOnly())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (!requireAdmin(interaction)) {
      await interaction.reply({ embeds: [rei.error(messages.noPermission())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const subgroup = interaction.options.getSubcommandGroup();
    const subcommand = interaction.options.getSubcommand();

    if (subgroup === "config") {
      await handleConfig(interaction, guildId, subcommand);
      return;
    }

    if (subcommand === "export") {
      const mes = interaction.options.getInteger("mes", true);
      const ano = interaction.options.getInteger("ano", true);
      const content = await generateMonthlyExport(guildId, ano, mes);

      const buffer = Buffer.from(content, "utf-8");
      const attachment = new AttachmentBuilder(buffer, {
        name: `registro-${ano}-${String(mes).padStart(2, "0")}.md`,
      });

      await interaction.reply({ files: [attachment], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (subcommand === "estado") {
      const user = interaction.options.getUser("usuario", true);
      const member = await memberService.getOrCreateMember(guildId, user.id);

      const stateHistory = await db
        .select()
        .from(schema.memberStateHistory)
        .where(eq(schema.memberStateHistory.userId, user.id));

      const embed = rei.info("Estado do Membro")
        .addFields(
          { name: "Usuario", value: user.tag, inline: true },
          { name: "Estado", value: member.state, inline: true },
          { name: "Ciclos falhos consecutivos", value: String(member.consecutiveFailedCycles), inline: true },
          { name: "Membro desde", value: member.joinedAt, inline: true },
          { name: "Historico", value: `${stateHistory.length} alteracoes`, inline: true },
        );

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (subcommand === "forcar-ciclo") {
      const existing = await cycleService.getActiveCycle(guildId);
      if (existing) {
        await interaction.reply({
          embeds: [rei.error(`Ciclo ${existing.cycleNumber} ainda ativo. Encerre antes de forcar novo.`)],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const cycle = await cycleService.openCycle(guildId);
      if (cycle) {
        await rescheduleGuild(guildId);
        await interaction.editReply({ embeds: [rei.success(`Ciclo ${cycle.cycleNumber} forcado.`)] });
      } else {
        await interaction.editReply({ embeds: [rei.error(messages.internalError())] });
      }
    }
  },
};

async function handleConfig(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  subcommand: string
): Promise<void> {
  const rows = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  if (rows.length === 0) {
    await db.insert(schema.guilds).values({ guildId, createdAt: new Date().toISOString() });
  }

  if (subcommand === "canal") {
    const canal = interaction.options.getChannel("canal", true);
    await db
      .update(schema.guilds)
      .set({ announcementChannelId: canal.id })
      .where(eq(schema.guilds.guildId, guildId));
  } else if (subcommand === "duracao") {
    const dias = interaction.options.getInteger("dias", true);
    await db
      .update(schema.guilds)
      .set({ cycleDurationDays: dias })
      .where(eq(schema.guilds.guildId, guildId));
  } else if (subcommand === "declaracao") {
    const horas = interaction.options.getInteger("horas", true);
    await db
      .update(schema.guilds)
      .set({ declarationDeadlineHours: horas })
      .where(eq(schema.guilds.guildId, guildId));
  } else if (subcommand === "review") {
    const horas = interaction.options.getInteger("horas", true);
    await db
      .update(schema.guilds)
      .set({ reviewPeriodHours: horas })
      .where(eq(schema.guilds.guildId, guildId));
  } else if (subcommand === "roles") {
    const ativo = interaction.options.getRole("ativo", true);
    const observador = interaction.options.getRole("observador", true);
    await db
      .update(schema.guilds)
      .set({ activeRoleId: ativo.id, observerRoleId: observador.id })
      .where(eq(schema.guilds.guildId, guildId));
  }

  await logEvent(guildId, EventType.CONFIG_UPDATED, {
    userId: interaction.user.id,
    payload: { field: subcommand },
  });

  await rescheduleGuild(guildId);
  await interaction.reply({ embeds: [rei.success(messages.configUpdated())], flags: [MessageFlags.Ephemeral] });
}
