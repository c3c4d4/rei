import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { blackholeService } from "./blackhole.service.js";
import { walletService } from "./wallet.service.js";
import { projectContractService } from "./project-contract.service.js";
import {
  XP_AWARDED_DAY_MULTIPLIER,
  XP_BASE_PER_PROJECT,
  XP_DIFFICULTY_MULTIPLIER,
  XP_LEVEL_FACTOR,
  XP_PER_REVIEW_AS_EVALUATOR,
} from "../utils/constants.js";

type ProfileSnapshot = {
  daysLeft: number;
  freezeDaysAvailable: number;
  freezeActiveUntil: string | null;
  currentStatus: string;
  projectStatus: string;
  projectsFinished: number;
  evaluationPoints: number;
  reviewerQuality: {
    average: number;
    ratings: number;
  };
  xp: {
    total: number;
    project: number;
    evaluator: number;
    level: number;
    formula: string;
  };
};

function calculateLevel(totalXp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(totalXp / XP_LEVEL_FACTOR)) + 1);
}

async function getProfileSnapshot(guildId: string, userId: string): Promise<ProfileSnapshot | undefined> {
  const blackhole = await blackholeService.getBlackholeStatus(guildId, userId);
  if (!blackhole) return undefined;

  const member = blackhole.member;
  const points = await walletService.getBalance(guildId, userId);

  const concludedProjects = await db
    .select({ id: schema.projectContracts.id })
    .from(schema.projectContracts)
    .where(
      and(
        eq(schema.projectContracts.guildId, guildId),
        eq(schema.projectContracts.userId, userId),
        eq(schema.projectContracts.status, "concluded")
      )
    );

  const approvedReviewRows = await db
    .select({
      difficulty: schema.reviewThreads.difficulty,
      awardedDays: schema.reviewThreads.awardedDays,
    })
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.guildId, guildId),
        eq(schema.reviewThreads.evaluateeUserId, userId),
        eq(schema.reviewThreads.stage, "approved")
      )
    );

  const evaluatorReviewRows = await db
    .select({ id: schema.reviewThreads.id })
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.guildId, guildId),
        eq(schema.reviewThreads.evaluatorUserId, userId),
        inArray(schema.reviewThreads.stage, ["approved", "rejected"])
      )
    );

  const evaluatorRatings = await db
    .select({ score: schema.reviewThreads.reviewerScore })
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.guildId, guildId),
        eq(schema.reviewThreads.evaluatorUserId, userId),
        inArray(schema.reviewThreads.stage, ["approved", "rejected", "expired"])
      )
    );

  let projectXp = 0;
  for (const row of approvedReviewRows) {
    const difficulty = row.difficulty ?? 1;
    const awardedDays = row.awardedDays ?? 0;
    projectXp +=
      XP_BASE_PER_PROJECT +
      difficulty * XP_DIFFICULTY_MULTIPLIER +
      awardedDays * XP_AWARDED_DAY_MULTIPLIER;
  }

  const evaluatorXp = evaluatorReviewRows.length * XP_PER_REVIEW_AS_EVALUATOR;
  const totalXp = projectXp + evaluatorXp;
  const level = calculateLevel(totalXp);
  const reviewerScores = evaluatorRatings
    .map((row) => row.score)
    .filter((score): score is number => typeof score === "number");
  const reviewerAverage =
    reviewerScores.length > 0
      ? reviewerScores.reduce((acc, value) => acc + value, 0) / reviewerScores.length
      : 0;

  const open = await projectContractService.getOpenContractForUser(guildId, userId);
  const delivered = open ? undefined : await projectContractService.getDeliveredContractForUser(guildId, userId);

  let projectStatus = "Available for a new project";
  if (open) {
    projectStatus = `Working on: ${open.title}`;
  } else if (delivered) {
    projectStatus = `Waiting review: ${delivered.title}`;
  }

  let currentStatus = "Active";
  if (member.bannedAt) {
    currentStatus = "Banned";
  } else if (blackhole.isFrozen && member.freezeActiveUntil) {
    currentStatus = `Frozen until ${member.freezeActiveUntil}`;
  }

  return {
    daysLeft: blackhole.daysRemaining,
    freezeDaysAvailable: blackhole.freezeDaysAvailable,
    freezeActiveUntil: member.freezeActiveUntil ?? null,
    currentStatus,
    projectStatus,
    projectsFinished: concludedProjects.length,
    evaluationPoints: points,
    reviewerQuality: {
      average: reviewerAverage,
      ratings: reviewerScores.length,
    },
    xp: {
      total: totalXp,
      project: projectXp,
      evaluator: evaluatorXp,
      level,
      formula:
        `projectXP = ${XP_BASE_PER_PROJECT} + difficulty × ${XP_DIFFICULTY_MULTIPLIER} + awardedDays × ${XP_AWARDED_DAY_MULTIPLIER}; ` +
        `evaluatorXP = reviews × ${XP_PER_REVIEW_AS_EVALUATOR}`,
    },
  };
}

export const profileService = {
  getProfileSnapshot,
};
