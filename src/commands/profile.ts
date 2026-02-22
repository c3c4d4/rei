import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { Command } from "../types/commands.js";
import { requireGuild } from "../utils/permissions.js";
import { memberService } from "../services/member.service.js";
import { blackholeService } from "../services/blackhole.service.js";
import { profileService } from "../services/profile.service.js";
import { walletService } from "../services/wallet.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { formatShort } from "../utils/time.js";

export const profileCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("profile")
    .setDescription("Profile, progression and gifting.")
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show your profile status.")
    )
    .addSubcommand((sub) =>
      sub
        .setName("gift")
        .setDescription("Gift evaluation points to another user.")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Recipient.").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt.setName("points").setDescription("Points to gift.").setRequired(true).setMinValue(1)
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

    if (subcommand === "gift") {
      const recipient = interaction.options.getUser("user", true);
      const points = interaction.options.getInteger("points", true);

      await memberService.getOrCreateMember(guildId, recipient.id);

      const status = await blackholeService.getBlackholeStatus(guildId, userId);
      if (status?.member.bannedAt) {
        await interaction.reply({ embeds: [rei.error(messages.blackholeReached())], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const result = await walletService.transferBalance(guildId, userId, recipient.id, points);
      if (result.kind === "invalid_amount") {
        await interaction.reply({ embeds: [rei.error(messages.giftInvalidAmount())], flags: [MessageFlags.Ephemeral] });
        return;
      }
      if (result.kind === "same_user") {
        await interaction.reply({ embeds: [rei.error(messages.giftCannotSelf())], flags: [MessageFlags.Ephemeral] });
        return;
      }
      if (result.kind === "insufficient_balance") {
        await interaction.reply({
          embeds: [rei.error(messages.giftInsufficient(result.currentBalance))],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await interaction.reply({
        embeds: [
          rei.success(messages.giftSuccess(`<@${recipient.id}>`, points)).addFields(
            { name: "Your Points", value: String(result.fromBalance), inline: true },
            { name: "Recipient Points", value: String(result.toBalance), inline: true }
          ),
        ],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    // subcommand === "status"
    const snapshot = await profileService.getProfileSnapshot(guildId, userId);
    if (!snapshot) {
      await interaction.reply({ embeds: [rei.error(messages.internalError())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const freezeUntil = snapshot.freezeActiveUntil
      ? `${formatShort(snapshot.freezeActiveUntil)} (Sao Paulo)`
      : "Not active";

    const embed = rei
      .info("Profile", "Your current progression snapshot.")
      .addFields(
        { name: "Current Status", value: snapshot.currentStatus, inline: true },
        { name: "Blackhole Days Left", value: String(snapshot.daysLeft), inline: true },
        { name: "Freeze Days Available", value: String(snapshot.freezeDaysAvailable), inline: true },
        { name: "Freeze Until", value: freezeUntil, inline: true },
        { name: "Project Status", value: snapshot.projectStatus, inline: false },
        { name: "Projects Finished", value: String(snapshot.projectsFinished), inline: true },
        { name: "Evaluation Points", value: String(snapshot.evaluationPoints), inline: true },
        {
          name: "Reviewer Quality",
          value: `${snapshot.reviewerQuality.average.toFixed(2)}/5 (${snapshot.reviewerQuality.ratings} rating(s))`,
          inline: true,
        },
        { name: "XP Total", value: String(snapshot.xp.total), inline: true },
        { name: "XP Level", value: String(snapshot.xp.level), inline: true },
        { name: "XP from Projects", value: String(snapshot.xp.project), inline: true },
        { name: "XP from Evaluating", value: String(snapshot.xp.evaluator), inline: true },
        { name: "XP Formula", value: snapshot.xp.formula, inline: false }
      );

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
