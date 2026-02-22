import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Command } from "../types/commands.js";
import { db, schema } from "../db/index.js";
import { REVIEW_CREDIT_COST } from "../utils/constants.js";
import { messages } from "../utils/messages.js";
import { rei } from "../utils/embeds.js";
import { requireGuild } from "../utils/permissions.js";

function sum(values: number[]): number {
  return values.reduce((acc, value) => acc + value, 0);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function getEconomyHealth(
  circulating: number,
  memberCount: number,
  burnedByTimeout: number
): string {
  if (memberCount === 0) return "No economy data yet.";
  const perMember = circulating / memberCount;
  if (perMember < 1) {
    return "Low liquidity: points are scarce. Review completion quality becomes critical.";
  }
  if (burnedByTimeout > memberCount) {
    return "Deflation pressure: too many missed deadlines are burning points.";
  }
  if (perMember > 4) {
    return "High liquidity: strong point availability across members.";
  }
  return "Balanced liquidity: point circulation is stable.";
}

export const poolCommand: Command = {
  data: new SlashCommandBuilder()
    .setName("pool")
    .setDescription("Show community point pool and economy analysis."),

  async execute(interaction) {
    if (!requireGuild(interaction)) {
      await interaction.reply({
        embeds: [rei.error(messages.guildOnly())],
        flags: [MessageFlags.Ephemeral],
      });
      return;
    }

    const guildId = interaction.guildId;

    const wallets = await db
      .select({
        userId: schema.wallets.userId,
        balance: schema.wallets.balance,
      })
      .from(schema.wallets)
      .where(eq(schema.wallets.guildId, guildId));

    const balances = wallets.map((item) => item.balance);
    const memberCount = wallets.length;
    const circulating = sum(balances);
    const average = memberCount > 0 ? circulating / memberCount : 0;
    const med = median(balances);

    const topHolders = [...wallets]
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    const openReviewSessions = await db
      .select({ id: schema.reviewThreads.id })
      .from(schema.reviewThreads)
      .where(
        and(
          eq(schema.reviewThreads.guildId, guildId),
          isNull(schema.reviewThreads.closedAt)
        )
      );
    const lockedInEscrow = openReviewSessions.length * REVIEW_CREDIT_COST;

    const ledgerRows = await db
      .select({
        delta: schema.walletLedger.delta,
        note: schema.walletLedger.note,
        entryType: schema.walletLedger.entryType,
      })
      .from(schema.walletLedger)
      .where(eq(schema.walletLedger.guildId, guildId));

    let seeded = 0;
    let burnedByTimeout = 0;
    let projectPenaltyLoss = 0;
    let timeoutRefunded = 0;
    let reviewerRewards = 0;
    let giftsMoved = 0;

    for (const row of ledgerRows) {
      if (row.entryType === "seed" && row.delta > 0) seeded += row.delta;
      if (row.entryType === "review_reward" && row.delta > 0) reviewerRewards += row.delta;
      if (row.note?.startsWith("review_timeout_burn_session:") && row.delta < 0) {
        burnedByTimeout += Math.abs(row.delta);
      }
      if (row.note?.startsWith("project_failure:") && row.delta < 0) {
        projectPenaltyLoss += Math.abs(row.delta);
      }
      if (row.note?.startsWith("review_timeout_refund_session:") && row.delta > 0) {
        timeoutRefunded += row.delta;
      }
      if ((row.note === "gift_sent" || row.note === "gift_received") && row.delta > 0) {
        giftsMoved += row.delta;
      }
    }

    const totalKnownSupply = circulating + lockedInEscrow;
    const health = getEconomyHealth(circulating, memberCount, burnedByTimeout);

    const embed = rei
      .info("Community Pool", "Internal point economy snapshot.")
      .addFields(
        { name: "Members with Wallet", value: String(memberCount), inline: true },
        { name: "Circulating Points", value: String(circulating), inline: true },
        { name: "Locked in Active Reviews", value: String(lockedInEscrow), inline: true },
        { name: "Total Known Supply", value: String(totalKnownSupply), inline: true },
        { name: "Average per Member", value: average.toFixed(2), inline: true },
        { name: "Median per Member", value: med.toFixed(2), inline: true },
        { name: "Seeded Points", value: String(seeded), inline: true },
        { name: "Reviewer Rewards Paid", value: String(reviewerRewards), inline: true },
        { name: "Timeout Refunds", value: String(timeoutRefunded), inline: true },
        { name: "Burned by Review Timeouts", value: String(burnedByTimeout), inline: true },
        { name: "Project Failure Penalties", value: String(projectPenaltyLoss), inline: true },
        { name: "Gift Volume", value: String(giftsMoved), inline: true },
        { name: "Economy Health", value: health, inline: false }
      );

    if (topHolders.length > 0) {
      embed.addFields({
        name: "Top Holders",
        value: topHolders.map((item, idx) => `${idx + 1}. <@${item.userId}> - ${item.balance}`).join("\n"),
        inline: false,
      });
    }

    const recentLedger = await db
      .select({
        userId: schema.walletLedger.userId,
        delta: schema.walletLedger.delta,
        note: schema.walletLedger.note,
        createdAt: schema.walletLedger.createdAt,
      })
      .from(schema.walletLedger)
      .where(eq(schema.walletLedger.guildId, guildId))
      .orderBy(desc(schema.walletLedger.createdAt))
      .limit(5);

    if (recentLedger.length > 0) {
      embed.addFields({
        name: "Recent Movements",
        value: recentLedger
          .map((entry) => `${entry.createdAt} | <@${entry.userId}> | ${entry.delta > 0 ? "+" : ""}${entry.delta} | ${entry.note ?? "-"}`)
          .join("\n")
          .slice(0, 1024),
        inline: false,
      });
    }

    await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
  },
};
