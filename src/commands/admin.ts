import { SlashCommandBuilder, ChannelType, MessageFlags } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";
import type { Command } from "../types/commands.js";
import { db, schema } from "../db/index.js";
import { and, eq } from "drizzle-orm";
import { memberService } from "../services/member.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { EventType } from "../utils/constants.js";
import { logEvent } from "../services/event-log.service.js";
import { requireGuild, requireAdmin } from "../utils/permissions.js";
import { rescheduleGuild } from "../scheduler/index.js";
import { formatShort } from "../utils/time.js";
import { kickstartService } from "../services/kickstart.service.js";

function formatMemberState(state: string): string {
  const labels: Record<string, string> = {
    active: "Active",
    observer: "Observer",
  };
  return labels[state] ?? state;
}

export const admin: Command = {
  data: new SlashCommandBuilder()
    .setName("rei")
    .setDescription("REI admin commands.")
    .addSubcommandGroup((group) =>
      group
        .setName("config")
        .setDescription("Server settings.")
        .addSubcommand((sub) =>
          sub
            .setName("channel")
            .setDescription("Set the announcements channel.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Text channel.")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("review-channel")
            .setDescription("Set the public review threads channel.")
            .addChannelOption((opt) =>
              opt
                .setName("channel")
                .setDescription("Text channel where review threads will be created.")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
            )
        )
        .addSubcommand((sub) =>
          sub
            .setName("roles")
            .setDescription("Set active and observer roles.")
            .addRoleOption((opt) =>
              opt.setName("active").setDescription("Role for active members.").setRequired(true)
            )
            .addRoleOption((opt) =>
              opt.setName("observer").setDescription("Role for observers.").setRequired(true)
            )
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("state")
        .setDescription("View a member state.")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("User.").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("kickstart")
        .setDescription("Reset legacy data and start everyone together.")
        .addBooleanOption((opt) =>
          opt
            .setName("confirm")
            .setDescription("Must be true. This action is destructive.")
            .setRequired(true)
        )
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
    const subgroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand();

    if (subgroup === "config") {
      await handleConfig(interaction, guildId, subcommand);
      return;
    }

    if (subcommand === "state") {
      const user = interaction.options.getUser("user", true);
      const member = await memberService.getOrCreateMember(guildId, user.id);

      const stateHistory = await db
        .select()
        .from(schema.memberStateHistory)
        .where(
          and(
            eq(schema.memberStateHistory.guildId, guildId),
            eq(schema.memberStateHistory.userId, user.id)
          )
        );

      const embed = rei.info("Member State")
        .addFields(
          { name: "User", value: user.tag, inline: true },
          { name: "State", value: formatMemberState(member.state), inline: true },
          { name: "Consecutive fail streak", value: String(member.consecutiveFailedCycles), inline: true },
          { name: "Member since", value: `${formatShort(member.joinedAt)} (Sao Paulo)`, inline: true },
          { name: "History", value: `${stateHistory.length} changes`, inline: true },
        );

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (subcommand === "kickstart") {
      const confirm = interaction.options.getBoolean("confirm", true);
      if (!confirm) {
        await interaction.reply({
          embeds: [rei.error(messages.kickstartConfirmRequired())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply({ embeds: [rei.error(messages.internalError())] });
        return;
      }

      const dbMembers = await db
        .select({ userId: schema.members.userId })
        .from(schema.members)
        .where(eq(schema.members.guildId, guildId));
      const dbUserIds = dbMembers.map((row) => row.userId);

      let guildUserIds: string[] = [];
      try {
        const fetchedMembers = await guild.members.fetch();
        guildUserIds = fetchedMembers
          .filter((member) => !member.user.bot)
          .map((member) => member.id);
      } catch {
        guildUserIds = [];
      }

      const allUserIds = Array.from(new Set([...dbUserIds, ...guildUserIds, interaction.user.id]));

      const result = await kickstartService.kickstartGuild(guildId, allUserIds);
      await rescheduleGuild(guildId);

      await interaction.editReply({
        embeds: [
          rei.success(messages.kickstartDone(result.membersSeeded)).addFields(
            { name: "Started At", value: `${formatShort(result.startedAt)} (Sao Paulo)`, inline: true },
            { name: "Blackhole Deadline", value: `${formatShort(result.blackholeDeadline)} (Sao Paulo)`, inline: true },
            { name: "Freeze Reset", value: `${formatShort(result.freezeResetAt)} (Sao Paulo)`, inline: true }
          ),
        ],
      });
      return;
    }

  },
};

async function handleConfig(
  interaction: ChatInputCommandInteraction,
  guildId: string,
  subcommand: string
): Promise<void> {
  let rows = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  if (rows.length === 0) {
    await db.insert(schema.guilds).values({ guildId, createdAt: new Date().toISOString() });
    rows = await db.select().from(schema.guilds).where(eq(schema.guilds.guildId, guildId));
  }
  const config = rows[0];
  if (!config) {
    await interaction.reply({ embeds: [rei.error(messages.internalError())], flags: [MessageFlags.Ephemeral] });
    return;
  }

  if (subcommand === "channel") {
    const channel = interaction.options.getChannel("channel", true);
    await db
      .update(schema.guilds)
      .set({ announcementChannelId: channel.id })
      .where(eq(schema.guilds.guildId, guildId));
  } else if (subcommand === "review-channel") {
    const channel = interaction.options.getChannel("channel", true);
    await db
      .update(schema.guilds)
      .set({ reviewChannelId: channel.id })
      .where(eq(schema.guilds.guildId, guildId));
  } else if (subcommand === "roles") {
    const active = interaction.options.getRole("active", true);
    const observer = interaction.options.getRole("observer", true);
    await db
      .update(schema.guilds)
      .set({ activeRoleId: active.id, observerRoleId: observer.id })
      .where(eq(schema.guilds.guildId, guildId));
  }

  await logEvent(guildId, EventType.CONFIG_UPDATED, {
    userId: interaction.user.id,
    payload: { field: subcommand },
  });

  await rescheduleGuild(guildId);
  await interaction.reply({ embeds: [rei.success(messages.configUpdated())], flags: [MessageFlags.Ephemeral] });
}
