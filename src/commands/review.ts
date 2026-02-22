import {
  AttachmentBuilder,
  ChannelType,
  MessageFlags,
  SlashCommandBuilder,
  TextChannel,
} from "discord.js";
import { eq } from "drizzle-orm";
import type { Command } from "../types/commands.js";
import { memberService } from "../services/member.service.js";
import { projectContractService } from "../services/project-contract.service.js";
import { reviewThreadService } from "../services/review-thread.service.js";
import { blackholeService } from "../services/blackhole.service.js";
import { db, schema } from "../db/index.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { requireGuild } from "../utils/permissions.js";
import { formatShort } from "../utils/time.js";

const THREAD_MESSAGE_LIMIT = 1900;

function truncateThreadMessage(content: string): { content: string; truncated: boolean } {
  if (content.length <= THREAD_MESSAGE_LIMIT) {
    return { content, truncated: false };
  }

  const suffix = "\n\n[Message truncated by REI due Discord length limit.]";
  const safeLength = Math.max(1, THREAD_MESSAGE_LIMIT - suffix.length);
  return {
    content: `${content.slice(0, safeLength)}${suffix}`,
    truncated: true,
  };
}

async function postToThread(
  interaction: Parameters<Command["execute"]>[0],
  threadId: string,
  content: string
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) return;
  const thread = await guild.channels.fetch(threadId).catch(() => null);
  if (thread?.isThread()) {
    await thread.send({ content, allowedMentions: { parse: [] } }).catch(() => {});
  }
}

export const review: Command = {
  data: new SlashCommandBuilder()
    .setName("review")
    .setDescription("Public review sessions.")
    .addSubcommand((sub) =>
      sub
        .setName("open")
        .setDescription("List delivered projects waiting for review claim.")
        .addIntegerOption((opt) =>
          opt
            .setName("limit")
            .setDescription("How many projects to list.")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("claim")
        .setDescription("Claim a delivered project to review (24h deadline).")
        .addIntegerOption((opt) =>
          opt.setName("project_id").setDescription("Project ID to review.").setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("score")
        .setDescription("Reviewer submits final score and closes review.")
        .addIntegerOption((opt) =>
          opt.setName("project_id").setDescription("Project ID from review thread.").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("score")
            .setDescription("Project score from 0 to 5. Minimum pass score is 3.")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(5)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("difficulty")
            .setDescription("Difficulty from 1 to 5.")
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(5)
        )
        .addStringOption((opt) =>
          opt
            .setName("summary")
            .setDescription("Reviewer final summary.")
            .setRequired(false)
            .setMaxLength(2000)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName("reviewer")
        .setDescription("Evaluatee rates reviewer quality after review closes.")
        .addIntegerOption((opt) =>
          opt.setName("project_id").setDescription("Project ID from review thread.").setRequired(true)
        )
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Reviewer user to rate.").setRequired(true)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("score")
            .setDescription("Reviewer quality score from 0 to 5.")
            .setRequired(true)
            .setMinValue(0)
            .setMaxValue(5)
        )
        .addStringOption((opt) =>
          opt
            .setName("comments")
            .setDescription("Comments about review quality.")
            .setRequired(true)
            .setMaxLength(2000)
        )
    )
    .addSubcommand((sub) =>
      sub.setName("status").setDescription("Show your active review session(s).")
    )
    .addSubcommand((sub) =>
      sub
        .setName("log")
        .setDescription("Show review history for this server.")
        .addBooleanOption((opt) =>
          opt
            .setName("full")
            .setDescription("Export full history as a markdown file.")
            .setRequired(false)
        )
        .addIntegerOption((opt) =>
          opt
            .setName("limit")
            .setDescription("How many latest sessions to show (embed mode).")
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(25)
        )
    ),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({
        embeds: [rei.error(messages.guildOnly())],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const subcommand = interaction.options.getSubcommand();

    await memberService.getOrCreateMember(guildId, userId);
    await Promise.all([
      blackholeService.settleExpiredMembers(guildId),
      projectContractService.settleExpiredContracts(guildId),
      reviewThreadService.settleExpiredReviewDeadlines(guildId),
    ]);

    if (subcommand === "open") {
      const limit = interaction.options.getInteger("limit") ?? 20;
      const delivered = await projectContractService.listDeliveredContracts(guildId, 100);
      const claimable: typeof delivered = [];

      for (const contract of delivered) {
        const active = await reviewThreadService.getActiveThreadForContract(contract.id);
        if (active) continue;
        claimable.push(contract);
        if (claimable.length >= limit) break;
      }

      if (claimable.length === 0) {
        await interaction.reply({
          embeds: [rei.info("Review Open", "No projects are currently waiting for review claim.")],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const embed = rei.info("Review Open", `${claimable.length} project(s) available to claim.`);
      for (const contract of claimable) {
        embed.addFields({
          name: `Project #${contract.id} - ${contract.title}`,
          value:
            `Owner: <@${contract.userId}>\n` +
            `Requirement: ${contract.requirement}\n` +
            `Delivered: ${contract.deliveredAt ? `${formatShort(contract.deliveredAt)} (Sao Paulo)` : "-"}\n` +
            `Claim: \`/review claim project_id:${contract.id}\``,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (subcommand === "status") {
      const sessions = await reviewThreadService.listActiveThreadsForUser(guildId, userId, 20);
      if (sessions.length === 0) {
        await interaction.reply({
          embeds: [rei.info("Review Status", messages.reviewNotFound())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const embed = rei.info("Review Status", `${sessions.length} active review session(s).`);
      for (const session of sessions) {
        const contract = await projectContractService.getContractById(session.contractId);
        const due = session.reviewDueAt ? `${formatShort(session.reviewDueAt)} (Sao Paulo)` : "-";
        embed.addFields({
          name: `Session #${session.id}`,
          value:
            `Thread: <#${session.threadId}>\n` +
            `Evaluatee: <@${session.evaluateeUserId}>\n` +
            `Evaluator: <@${session.evaluatorUserId}>\n` +
            `Project: ${contract?.title ?? `#${session.contractId}`}\n` +
            `Due: ${due}`,
          inline: false,
        });
      }

      await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
      return;
    }

    if (subcommand === "log") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      const full = interaction.options.getBoolean("full") ?? false;
      const limit = interaction.options.getInteger("limit") ?? 20;

      if (full) {
        const sessions = await reviewThreadService.listFullHistory(guildId);
        if (sessions.length === 0) {
          await interaction.editReply({
            embeds: [rei.info("Review Log", "No review history yet.")],
          });
          return;
        }

        const lines: string[] = ["# Review Log", `Total sessions: ${sessions.length}`, ""];
        for (const session of sessions) {
          const contract = await projectContractService.getContractById(session.contractId);
          const outcome =
            session.stage === "approved"
              ? "Approved"
              : session.stage === "rejected"
                ? "Rejected"
                : session.stage === "expired"
                  ? "Expired"
                  : "Open";
          lines.push(`## Project #${session.contractId} - ${contract?.title ?? "Unknown"}`);
          lines.push(`Session: ${session.id}`);
          lines.push(`Outcome: ${outcome}`);
          lines.push(`Evaluatee: ${session.evaluateeUserId}`);
          lines.push(`Evaluator: ${session.evaluatorUserId}`);
          lines.push(`Project score: ${session.projectScore ?? "-"}/5`);
          lines.push(`Difficulty: ${session.difficulty ?? "-"}/5`);
          lines.push(`Reviewer score: ${session.reviewerScore ?? "-"}/5`);
          lines.push(`Thread ID: ${session.threadId}`);
          lines.push(`Opened: ${session.createdAt}`);
          lines.push(`Due: ${session.reviewDueAt ?? "-"}`);
          lines.push(`Closed: ${session.closedAt ?? "-"}`);
          if (session.feedback) {
            lines.push(`Reviewer summary: ${session.feedback}`);
          }
          if (session.reviewerComment) {
            lines.push(`Evaluatee feedback on reviewer: ${session.reviewerComment}`);
          }
          lines.push("");
        }

        const attachment = new AttachmentBuilder(Buffer.from(lines.join("\n"), "utf-8"), {
          name: "review-log.md",
        });
        await interaction.editReply({ files: [attachment] });
        return;
      }

      const sessions = await reviewThreadService.listHistory(guildId, limit);
      if (sessions.length === 0) {
        await interaction.editReply({
          embeds: [rei.info("Review Log", "No review history yet.")],
        });
        return;
      }

      const embed = rei.info("Review Log", `Latest ${sessions.length} session(s).`);
      for (const session of sessions) {
        const contract = await projectContractService.getContractById(session.contractId);
        const outcome =
          session.stage === "approved"
            ? "Approved"
            : session.stage === "rejected"
              ? "Rejected"
              : session.stage === "expired"
                ? "Expired"
                : "Open";
        const projectScore = session.projectScore !== null ? `${session.projectScore}/5` : "-";
        const difficulty = session.difficulty !== null ? `${session.difficulty}/5` : "-";
        const reviewerScore = session.reviewerScore !== null ? `${session.reviewerScore}/5` : "-";
        const closedAt = session.closedAt ? `${formatShort(session.closedAt)} (Sao Paulo)` : "-";
        const due = session.reviewDueAt ? `${formatShort(session.reviewDueAt)} (Sao Paulo)` : "-";

        embed.addFields({
          name: `Project #${session.contractId} - ${contract?.title ?? "Unknown"}`,
          value:
            `Outcome: ${outcome}\n` +
            `Evaluatee: <@${session.evaluateeUserId}> | Evaluator: <@${session.evaluatorUserId}>\n` +
            `Project Score: ${projectScore} | Difficulty: ${difficulty}\n` +
            `Reviewer Score: ${reviewerScore}\n` +
            `Due: ${due}\n` +
            `Thread: <#${session.threadId}> | Closed: ${closedAt}`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    if (subcommand === "claim") {
      await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

      const eligibility = await blackholeService.getWorkEligibility(guildId, userId);
      if (!eligibility || !eligibility.allowed) {
        const msg = eligibility?.reason === "frozen" ? messages.freezeBlocksWork() : messages.blackholeReached();
        await interaction.editReply({ embeds: [rei.error(msg)] });
        return;
      }

      const projectId = interaction.options.getInteger("project_id", true);
      const contract = await projectContractService.getContractById(projectId);
      if (!contract || contract.guildId !== guildId) {
        await interaction.editReply({ embeds: [rei.error(messages.projectNotFound())] });
        return;
      }
      if (contract.status !== "delivered") {
        await interaction.editReply({
          embeds: [rei.error("Project is not waiting for review. Only delivered projects can be claimed.")],
        });
        return;
      }
      if (contract.userId === userId) {
        await interaction.editReply({ embeds: [rei.error("You cannot review your own project.")] });
        return;
      }

      if (await reviewThreadService.hasEvaluatorReviewedContract(contract.id, userId)) {
        await interaction.editReply({ embeds: [rei.error(messages.reviewerAlreadyUsed())] });
        return;
      }

      const active = await reviewThreadService.getActiveThreadForContract(contract.id);
      if (active) {
        await interaction.editReply({ embeds: [rei.error(messages.activeReviewExists())] });
        return;
      }

      await memberService.getOrCreateMember(guildId, contract.userId);

      const configRows = await db
        .select()
        .from(schema.guilds)
        .where(eq(schema.guilds.guildId, guildId))
        .limit(1);
      const config = configRows[0];
      if (!config?.reviewChannelId) {
        await interaction.editReply({ embeds: [rei.error(messages.reviewChannelNotConfigured())] });
        return;
      }

      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply({ embeds: [rei.error(messages.internalError())] });
        return;
      }

      const channel = await guild.channels.fetch(config.reviewChannelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.editReply({ embeds: [rei.error("Configured review channel must be a text channel.")] });
        return;
      }

      const reviewChannel = channel as TextChannel;
      const threadName = `${contract.id}-${contract.title}`.slice(0, 100);
      const thread = await reviewChannel.threads.create({
        name: threadName,
        autoArchiveDuration: 10080,
        reason: `Review claim for project contract ${contract.id}`,
      });

      const sessionResult = await reviewThreadService.createReviewThreadSession({
        guildId,
        contractId: contract.id,
        evaluateeUserId: contract.userId,
        evaluatorUserId: userId,
        threadId: thread.id,
      });

      if (sessionResult.kind !== "ok") {
        await thread.delete("Review claim failed due validation/concurrency guard.").catch(async () => {
          await thread.setArchived(true, "Review claim failed due validation/concurrency guard.").catch(() => {});
        });

        if (sessionResult.kind === "already_exists") {
          const existingMention = sessionResult.session ? `<#${sessionResult.session.threadId}>` : "existing thread";
          await interaction.editReply({
            embeds: [rei.error(`${messages.activeReviewExists()} Continue in ${existingMention}.`)],
          });
          return;
        }
        if (sessionResult.kind === "reviewer_already_used") {
          await interaction.editReply({ embeds: [rei.error(messages.reviewerAlreadyUsed())] });
          return;
        }
        if (sessionResult.kind === "insufficient_points") {
          await interaction.editReply({
            embeds: [
              rei.error(
                `Evaluatee has insufficient points to fund this review (balance: ${sessionResult.currentBalance}).`
              ),
            ],
          });
          return;
        }
        if (sessionResult.kind === "busy") {
          await interaction.editReply({ embeds: [rei.error(messages.retrySoon())] });
          return;
        }

        await interaction.editReply({ embeds: [rei.error(messages.internalError())] });
        return;
      }

      const session = sessionResult.session;
      const lines: string[] = [
        `Review claimed for **${contract.title}**`,
        `Project ID: ${contract.id}`,
        `Evaluatee: <@${contract.userId}>`,
        `Evaluator: <@${userId}>`,
        `Review due: ${session.reviewDueAt ? `${formatShort(session.reviewDueAt)} (Sao Paulo)` : "-"}`,
        `Requirement: ${contract.requirement}`,
        `Expected artifact: ${contract.expectedArtifact}`,
      ];
      if (contract.deliveryLink) {
        lines.push(`Delivery link: ${contract.deliveryLink}`);
      }
      if (contract.deliveryAttachmentUrl) {
        const decoded = projectContractService.decodeDeliveryPayload(contract.deliveryAttachmentUrl);
        decoded.attachments.forEach((url, idx) => lines.push(`Attachment ${idx + 1}: ${url}`));
        if (decoded.legacyAttachmentText) {
          lines.push(`Attachment: ${decoded.legacyAttachmentText}`);
        }
        if (decoded.readme) {
          const trimmed = decoded.readme.trim();
          const maxPreviewLength = 1200;
          const preview =
            trimmed.length > maxPreviewLength
              ? `${trimmed.slice(0, maxPreviewLength)}\n\n[README preview truncated]`
              : trimmed;
          lines.push("");
          lines.push("README:");
          lines.push("```md");
          lines.push(preview);
          lines.push("```");
        }
      }
      lines.push("");
      lines.push("Conversation is open to the community in this thread.");
      lines.push("Reviewer validates README criteria and project quality.");
      lines.push(
        `Reviewer closes with: \`/review score project_id:${contract.id} score:<0-5> difficulty:<1-5>\``
      );
      lines.push(
        `Evaluatee rates reviewer with: \`/review reviewer project_id:${contract.id} user:<@${userId}> score:<0-5> comments:<text>\``
      );
      lines.push("If review deadline expires (24h), evaluatee is refunded and reviewer loses 1 point.");

      const threadBody = truncateThreadMessage(lines.join("\n"));
      await thread.send({ content: threadBody.content, allowedMentions: { parse: [] } });
      if (threadBody.truncated) {
        await thread.send({
          content:
            "Some delivery details were truncated due Discord limits. Evaluatee can resubmit delivery updates before a new review cycle.",
          allowedMentions: { parse: [] },
        });
      }

      await interaction.editReply({
        embeds: [
          rei
            .success(`Review session created: <#${thread.id}> (session #${session.id}).`)
            .setDescription(messages.reviewFlowHint()),
        ],
      });
      return;
    }

    if (subcommand === "score") {
      const eligibility = await blackholeService.getWorkEligibility(guildId, userId);
      if (!eligibility || !eligibility.allowed) {
        const msg = eligibility?.reason === "frozen" ? messages.freezeBlocksWork() : messages.blackholeReached();
        await interaction.reply({ embeds: [rei.error(msg)], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const projectId = interaction.options.getInteger("project_id", true);
      const score = interaction.options.getInteger("score", true);
      const difficulty = interaction.options.getInteger("difficulty", true);
      const summary = interaction.options.getString("summary");

      const session = await reviewThreadService.getActiveThreadForContract(projectId);
      if (!session || session.guildId !== guildId) {
        await interaction.reply({
          embeds: [rei.error(messages.evaluateSessionNotFound())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const result = await reviewThreadService.submitEvaluatorOutcome(
        session.id,
        userId,
        score,
        difficulty,
        summary
      );

      if (result.kind === "forbidden") {
        await interaction.reply({
          embeds: [rei.error(messages.evaluatorOnlyAction())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "invalid_score") {
        await interaction.reply({
          embeds: [rei.error(messages.projectScoreInvalid())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "invalid_difficulty") {
        await interaction.reply({
          embeds: [rei.error(messages.difficultyInvalid())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "deadline_passed") {
        await reviewThreadService.settleExpiredReviewDeadlines(guildId);
        await interaction.reply({
          embeds: [rei.error(messages.reviewDeadlinePassed())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "busy") {
        await interaction.reply({
          embeds: [rei.error(messages.retrySoon())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "not_found") {
        await interaction.reply({
          embeds: [rei.error(messages.evaluateSessionNotFound())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const summaryLine = summary?.trim().length ? `\nSummary: ${summary}` : "";
      await postToThread(
        interaction,
        result.session.threadId,
        `**Reviewer score by <@${userId}>**\nProject score: ${score}/5\nDifficulty: ${difficulty}/5${summaryLine}\nOutcome: ${result.approved ? "Approved" : "Rejected"}`
      );

      if (result.approved) {
        await interaction.reply({
          embeds: [rei.success(messages.projectEvaluationApproved(result.awardedDays))],
          flags: [MessageFlags.Ephemeral],
        });
      } else {
        await interaction.reply({
          embeds: [rei.warning(messages.projectEvaluationRejected())],
          flags: [MessageFlags.Ephemeral],
        });
      }
      return;
    }

    if (subcommand === "reviewer") {
      const eligibility = await blackholeService.getWorkEligibility(guildId, userId);
      if (!eligibility || !eligibility.allowed) {
        const msg = eligibility?.reason === "frozen" ? messages.freezeBlocksWork() : messages.blackholeReached();
        await interaction.reply({ embeds: [rei.error(msg)], flags: [MessageFlags.Ephemeral] });
        return;
      }

      const projectId = interaction.options.getInteger("project_id", true);
      const evaluator = interaction.options.getUser("user", true);
      const score = interaction.options.getInteger("score", true);
      const comments = interaction.options.getString("comments", true);

      const session = await reviewThreadService.getLatestClosedThreadForContract(projectId);
      if (!session || session.guildId !== guildId) {
        await interaction.reply({
          embeds: [rei.error(messages.evaluateClosedSessionNotFound())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      const result = await reviewThreadService.submitEvaluateeEvaluation(
        session.id,
        userId,
        evaluator.id,
        score,
        comments
      );

      if (result.kind === "forbidden") {
        await interaction.reply({
          embeds: [rei.error(messages.evaluateeOnlyAction())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "evaluator_mismatch") {
        await interaction.reply({
          embeds: [rei.error(messages.evaluatorMismatch())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "invalid_score") {
        await interaction.reply({
          embeds: [rei.error(messages.reviewerScoreInvalid())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "wrong_stage") {
        await interaction.reply({
          embeds: [rei.error(messages.evaluateClosedSessionNotFound())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "already_registered") {
        await interaction.reply({
          embeds: [rei.error(messages.evaluatorFeedbackAlreadySaved())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "busy") {
        await interaction.reply({
          embeds: [rei.error(messages.retrySoon())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }
      if (result.kind === "not_found") {
        await interaction.reply({
          embeds: [rei.error(messages.evaluateClosedSessionNotFound())],
          flags: [MessageFlags.Ephemeral],
        });
        return;
      }

      await postToThread(
        interaction,
        result.session.threadId,
        `**Evaluatee review of reviewer by <@${userId}>**\nTarget reviewer: <@${evaluator.id}>\nScore: ${score}/5\nComments: ${comments}`
      );

      await interaction.reply({
        embeds: [rei.success(messages.evaluatorFeedbackSaved())],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    await interaction.reply({
      embeds: [rei.error(messages.internalError())],
      flags: [MessageFlags.Ephemeral],
    });
  },
};
