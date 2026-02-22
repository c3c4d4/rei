import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { projectContractService } from "../services/project-contract.service.js";
import { memberService } from "../services/member.service.js";
import { blackholeService } from "../services/blackhole.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import {
  DEFAULT_PROJECT_DURATION_HOURS,
  MAX_PROJECT_DURATION_HOURS,
  MIN_PROJECT_DURATION_HOURS,
} from "../utils/constants.js";
import { requireGuild } from "../utils/permissions.js";
import { formatShort } from "../utils/time.js";

export const projectCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("project")
    .setDescription("Start and track projects.")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a new project with a deadline.")
        .addStringOption((opt) =>
          opt.setName("title").setDescription("Project title.").setRequired(true).setMaxLength(100)
        )
        .addStringOption((opt) =>
          opt.setName("description").setDescription("Brief description.").setRequired(true).setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt.setName("requirement").setDescription("Mandatory project requirement.").setRequired(true).setMaxLength(500)
        )
        .addStringOption((opt) =>
          opt.setName("artifact").setDescription("Expected artifact.").setRequired(true).setMaxLength(200)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("duration_hours")
            .setDescription("Time to complete the project, in hours.")
            .setRequired(false)
            .setMinValue(MIN_PROJECT_DURATION_HOURS)
            .setMaxValue(MAX_PROJECT_DURATION_HOURS)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List open projects.")
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("View your current project status.")
    )
    .addSubcommand((sub) =>
      sub.setName("concluded").setDescription("List your concluded projects.")
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
    await projectContractService.settleExpiredContracts(guildId);
    await blackholeService.settleExpiredMembers(guildId);

    if (subcommand === "list") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const contracts = await projectContractService.listOpenContracts(guildId);
      if (contracts.length === 0) {
        await interaction.editReply({
          embeds: [rei.info("Open Projects", "No open projects right now.")],
        });
        return;
      }

      const embed = rei.info("Open Projects", `${contracts.length} open project(s).`);

      for (const p of contracts) {
        const ownerLabel = `<@${p.userId}>`;
        embed.addFields({
          name: ownerLabel,
          value:
            `**${p.title}**\n` +
            `${p.description}\n` +
            `Requirement: ${p.requirement}\n` +
            `Artifact: ${p.expectedArtifact}\n` +
            `Due: ${formatShort(p.dueAt)} (Sao Paulo)`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === "status") {
      const open = await projectContractService.getOpenContractForUser(guildId, userId);
      if (open) {
        const embed = rei
          .info("Project Status", "Your project is currently in progress.")
          .addFields(
            { name: "Title", value: open.title, inline: false },
            { name: "Requirement", value: open.requirement, inline: false },
            { name: "Artifact", value: open.expectedArtifact, inline: false },
            { name: "Due", value: `${formatShort(open.dueAt)} (Sao Paulo)`, inline: true },
            { name: "Status", value: "Open", inline: true }
          );
        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const delivered = await projectContractService.getDeliveredContractForUser(guildId, userId);
      if (delivered) {
        const embed = rei
          .info("Project Status", messages.projectNeedsReview())
          .addFields(
            { name: "Title", value: delivered.title, inline: false },
            { name: "Requirement", value: delivered.requirement, inline: false },
            { name: "Delivered At", value: delivered.deliveredAt ? `${formatShort(delivered.deliveredAt)} (Sao Paulo)` : "-", inline: true },
            { name: "Status", value: "Delivered", inline: true }
          );
        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const latest = await projectContractService.getLatestContractForUser(guildId, userId);
      if (!latest) {
        await interaction.reply({
          embeds: [rei.info("Project Status", "You do not have any started project yet.")],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const statusLabel =
        latest.status === "concluded"
          ? "Concluded"
          : latest.status === "failed"
            ? "Failed"
            : latest.status === "delivered"
              ? "Delivered"
              : "Open";

      const endAt =
        latest.status === "concluded"
          ? latest.concludedAt
          : latest.status === "failed"
            ? latest.failedAt
            : latest.deliveredAt;

      const embed = rei
        .info("Project Status", `Latest project status: ${statusLabel}.`)
        .addFields(
          { name: "Title", value: latest.title, inline: false },
          { name: "Requirement", value: latest.requirement, inline: false },
          { name: "Started", value: `${formatShort(latest.acceptedAt)} (Sao Paulo)`, inline: true },
          { name: "Deadline", value: `${formatShort(latest.dueAt)} (Sao Paulo)`, inline: true },
          { name: "Last Update", value: endAt ? `${formatShort(endAt)} (Sao Paulo)` : "-", inline: true }
        );
      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (subcommand === "concluded") {
      const concluded = await projectContractService.listConcludedContractsForUser(guildId, userId, 10);
      if (concluded.length === 0) {
        await interaction.reply({
          embeds: [rei.info("Concluded Projects", "You do not have concluded projects yet.")],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const embed = rei.info("Concluded Projects", `Showing ${concluded.length} concluded project(s).`);
      for (const contract of concluded) {
        embed.addFields({
          name: contract.title,
          value:
            `Requirement: ${contract.requirement}\n` +
            `Artifact: ${contract.expectedArtifact}\n` +
            `Concluded: ${contract.concludedAt ? formatShort(contract.concludedAt) : "-"} (Sao Paulo)`,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    // subcommand === "start"
    const eligibility = await blackholeService.getWorkEligibility(guildId, userId);
    if (!eligibility) {
      await interaction.reply({ embeds: [rei.error(messages.internalError())], flags: [MessageFlags.Ephemeral] });
      return;
    }
    if (!eligibility.allowed) {
      const msg = eligibility.reason === "frozen" ? messages.freezeBlocksWork() : messages.blackholeReached();
      await interaction.reply({ embeds: [rei.error(msg)], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const title = interaction.options.getString("title", true);
    const description = interaction.options.getString("description", true);
    const requirement = interaction.options.getString("requirement", true);
    const artifact = interaction.options.getString("artifact", true);
    const durationHours =
      interaction.options.getInteger("duration_hours") ?? DEFAULT_PROJECT_DURATION_HOURS;

    const accepted = await projectContractService.acceptContract(
      guildId,
      userId,
      title,
      description,
      requirement,
      artifact,
      durationHours
    );
    if (!accepted) {
      await interaction.reply({ embeds: [rei.error(messages.projectAlreadyDeclared())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.reply({
      embeds: [
        rei.success(`${messages.projectDeclared(title)} Due: ${formatShort(accepted.dueAt)} (Sao Paulo).`)
      ],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
