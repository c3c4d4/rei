import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/commands.js";
import { requireGuild } from "../utils/permissions.js";
import { memberService } from "../services/member.service.js";
import { blackholeService } from "../services/blackhole.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { MAX_FREEZE_DAYS_PER_USE } from "../utils/constants.js";
import { formatShort } from "../utils/time.js";

export const blackholeCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("blackhole")
    .setDescription("Blackhole countdown and freeze controls.")
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show your blackhole status.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("freeze")
        .setDescription("Use freeze days to pause blackhole countdown.")
        .addIntegerOption((opt) =>
          opt
            .setName("days")
            .setDescription("Days to freeze now.")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(MAX_FREEZE_DAYS_PER_USE)
        )
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
    await blackholeService.settleExpiredMembers(guildId);

    if (subcommand === "freeze") {
      const days = interaction.options.getInteger("days", true);
      const result = await blackholeService.activateFreeze(guildId, userId, days);

      if (result.kind === "invalid_days") {
        await interaction.reply({ embeds: [rei.error("Invalid freeze days.")], flags: [MessageFlags.Ephemeral] });
        return;
      }
      if (result.kind === "member_not_found") {
        await interaction.reply({ embeds: [rei.error(messages.internalError())], flags: [MessageFlags.Ephemeral] });
        return;
      }
      if (result.kind === "banned") {
        await interaction.reply({ embeds: [rei.error(messages.blackholeReached())], flags: [MessageFlags.Ephemeral] });
        return;
      }
      if (result.kind === "insufficient") {
        await interaction.reply({ embeds: [rei.error(messages.freezeInsufficient())], flags: [MessageFlags.Ephemeral] });
        return;
      }

      await interaction.reply({
        embeds: [
          rei
            .success(messages.freezeActivated(days))
            .addFields(
              { name: "Freeze Until", value: `${formatShort(result.freezeUntil)} (Sao Paulo)`, inline: true },
              { name: "Blackhole Deadline", value: `${formatShort(result.member.blackholeDeadline)} (Sao Paulo)`, inline: true },
              { name: "Freeze Days Left", value: String(result.member.freezeDaysAvailable), inline: true }
            ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const status = await blackholeService.getBlackholeStatus(guildId, userId);
    if (!status) {
      await interaction.reply({ embeds: [rei.error(messages.internalError())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const freezeUntil =
      status.member.freezeActiveUntil && status.isFrozen
        ? `${formatShort(status.member.freezeActiveUntil)} (Sao Paulo)`
        : "Not active";

    const embed = rei
      .info("Blackhole Status", messages.blackholeStatusLine(status.daysRemaining))
      .addFields(
        { name: "Blackhole Deadline", value: `${formatShort(status.member.blackholeDeadline)} (Sao Paulo)`, inline: true },
        { name: "Freeze Active", value: status.isFrozen ? "Yes" : "No", inline: true },
        { name: "Freeze Until", value: freezeUntil, inline: true },
        { name: "Freeze Days Available", value: String(status.freezeDaysAvailable), inline: true },
        { name: "Freeze Allowance Reset", value: `${formatShort(status.member.freezeAllowanceResetAt)} (Sao Paulo)`, inline: true }
      );

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
