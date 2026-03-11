import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { projectContractService } from "../services/project-contract.service.js";
import { memberService } from "../services/member.service.js";
import { blackholeService } from "../services/blackhole.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { requireGuild } from "../utils/permissions.js";
import { formatShort } from "../utils/time.js";

const DISPLAY_TIMEZONE_LABEL = "Asia/Tokyo";
const PROJECTS_PER_EMBED_PAGE = 4;
const MAX_EMBEDS_PER_REPLY = 10;
const MAX_FIELD_VALUE_LENGTH = 1024;

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function formatTokyoDate(iso: string): string {
  return `${formatShort(iso)} (${DISPLAY_TIMEZONE_LABEL})`;
}

export const projectCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("project")
    .setDescription("Start and track projects.")
    .addSubcommand((sub) =>
      sub
        .setName("start")
        .setDescription("Start a new project.")
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

      const ownerIds = [...new Set(contracts.map((contract) => contract.userId))];
      const ownerLabels = new Map<string, string>();

      if (interaction.guild) {
        await Promise.all(
          ownerIds.map(async (ownerId) => {
            try {
              const member = await interaction.guild!.members.fetch(ownerId);
              ownerLabels.set(ownerId, `${member.displayName} (<@${ownerId}>)`);
            } catch {
              // Fall back to global user lookup below.
            }
          })
        );
      }

      await Promise.all(
        ownerIds
          .filter((ownerId) => !ownerLabels.has(ownerId))
          .map(async (ownerId) => {
            try {
              const user = await interaction.client.users.fetch(ownerId);
              ownerLabels.set(ownerId, `${user.globalName ?? user.username} (<@${ownerId}>)`);
            } catch {
              ownerLabels.set(ownerId, `<@${ownerId}>`);
            }
          })
      );

      const pages = chunkArray(contracts, PROJECTS_PER_EMBED_PAGE);
      const visiblePages = pages.slice(0, MAX_EMBEDS_PER_REPLY);
      const embeds = visiblePages.map((pageContracts, pageIndex) => {
        const pageNumber = pageIndex + 1;
        const title =
          pages.length > 1 ? `Open Projects • Page ${pageNumber}/${pages.length}` : "Open Projects";
        const embed = rei.info(
          title,
          `${contracts.length} open project(s) • Times shown in ${DISPLAY_TIMEZONE_LABEL}.`
        );

        for (let i = 0; i < pageContracts.length; i++) {
          const contract = pageContracts[i];
          const ownerLabel = ownerLabels.get(contract.userId) ?? `<@${contract.userId}>`;
          const projectIndex = pageIndex * PROJECTS_PER_EMBED_PAGE + i + 1;
          const fieldName = truncateText(`${projectIndex}. ${contract.title}`, 256);
          const fieldValue = [
            `Owner: ${ownerLabel}`,
            `Summary: ${truncateText(contract.description, 220)}`,
            `Requirement: ${truncateText(contract.requirement, 220)}`,
            `Artifact: ${truncateText(contract.expectedArtifact, 120)}`,
            `Due: ${formatTokyoDate(contract.dueAt)}`,
          ].join("\n");

          embed.addFields({
            name: fieldName,
            value: truncateText(fieldValue, MAX_FIELD_VALUE_LENGTH),
            inline: false,
          });
        }

        return embed;
      });

      const shownProjects = visiblePages.reduce((count, page) => count + page.length, 0);
      const omittedProjects = contracts.length - shownProjects;
      if (omittedProjects > 0) {
        embeds[embeds.length - 1].addFields({
          name: "More Open Projects",
          value: `${omittedProjects} additional project(s) not shown due to Discord embed limits.`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds });
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
            { name: "Due", value: formatTokyoDate(open.dueAt), inline: true },
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
            { name: "Delivered At", value: delivered.deliveredAt ? formatTokyoDate(delivered.deliveredAt) : "-", inline: true },
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
          { name: "Started", value: formatTokyoDate(latest.acceptedAt), inline: true },
          { name: "Deadline", value: formatTokyoDate(latest.dueAt), inline: true },
          { name: "Last Update", value: endAt ? formatTokyoDate(endAt) : "-", inline: true }
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
            `Concluded: ${contract.concludedAt ? formatTokyoDate(contract.concludedAt) : "-"}`,
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
    const blackholeDueAt = eligibility.member.blackholeDeadline;
    const durationHours = Math.max(
      1,
      Math.ceil((new Date(blackholeDueAt).getTime() - Date.now()) / (60 * 60 * 1000))
    );

    const accepted = await projectContractService.acceptContract(
      guildId,
      userId,
      title,
      description,
      requirement,
      artifact,
      durationHours,
      blackholeDueAt
    );
    if (!accepted) {
      await interaction.reply({ embeds: [rei.error(messages.projectAlreadyDeclared())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.reply({
      embeds: [
        rei.success(`${messages.projectDeclared(title)} Due: ${formatTokyoDate(accepted.dueAt)}.`)
      ],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
