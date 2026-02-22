import { SlashCommandBuilder, MessageFlags } from "discord.js";
import type { Command } from "../types/commands.js";
import { projectContractService } from "../services/project-contract.service.js";
import { memberService } from "../services/member.service.js";
import { blackholeService } from "../services/blackhole.service.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { requireGuild } from "../utils/permissions.js";

export const deliveryCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("delivery")
    .setDescription("Delivery management.")
    .addSubcommand((sub) =>
      sub
        .setName("submit")
        .setDescription("Submit your project delivery.")
        .addStringOption((opt) =>
          opt
            .setName("readme")
            .setDescription("README.md content (validated by evaluator during review).")
            .setRequired(true)
            .setMaxLength(4000)
        )
        .addStringOption((opt) =>
          opt.setName("link").setDescription("Artifact link.").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("file1").setDescription("Artifact file.").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("file2").setDescription("Second file (optional).").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("file3").setDescription("Third file (optional).").setRequired(false)
        )
        .addAttachmentOption((opt) =>
          opt.setName("file4").setDescription("Fourth file (optional).").setRequired(false)
        )
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({ embeds: [rei.error(messages.guildOnly())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;

    await memberService.getOrCreateMember(guildId, userId);
    await blackholeService.settleExpiredMembers(guildId);
    const status = await blackholeService.getBlackholeStatus(guildId, userId);
    if (status?.member.bannedAt) {
      await interaction.reply({ embeds: [rei.error(messages.blackholeReached())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const link = interaction.options.getString("link");
    const readme = interaction.options.getString("readme", true);
    const attachments = [
      interaction.options.getAttachment("file1"),
      interaction.options.getAttachment("file2"),
      interaction.options.getAttachment("file3"),
      interaction.options.getAttachment("file4"),
    ].filter((a): a is NonNullable<typeof a> => a !== null);

    if (!link && attachments.length === 0) {
      await interaction.reply({ embeds: [rei.error(messages.provideInput())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    const attachmentUrls = attachments.map((a) => a.url);
    const result = await projectContractService.submitActiveContractDelivery(
      guildId,
      userId,
      link,
      attachmentUrls.length > 0 ? attachmentUrls : null,
      readme
    );

    if (result.kind === "not_found") {
      await interaction.reply({ embeds: [rei.error(messages.noProjectDeclared())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (result.kind === "overdue_failed") {
      await interaction.reply({ embeds: [rei.error(messages.projectOverdueFailed())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (result.kind === "already_delivered" || result.kind === "already_concluded") {
      await interaction.reply({ embeds: [rei.error(messages.deliveryAlreadySubmitted())], flags: [MessageFlags.Ephemeral] });
      return;
    }

    await interaction.reply({ embeds: [rei.success(messages.deliverySubmitted())], flags: [MessageFlags.Ephemeral] });
  },
};
