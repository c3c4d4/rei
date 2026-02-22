import { and, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { addDays, addHours, now } from "../utils/time.js";
import {
  INITIAL_REVIEW_CREDITS,
  ProjectDifficultyDays,
  REVIEW_CREDIT_COST,
  REVIEW_DEADLINE_HOURS,
  ReviewStage,
} from "../utils/constants.js";

type ReviewThread = typeof schema.reviewThreads.$inferSelect;
type ProjectContract = typeof schema.projectContracts.$inferSelect;

type EvaluatorOutcomeResult =
  | { kind: "ok"; session: ReviewThread; approved: boolean; awardedDays: number }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "invalid_score" }
  | { kind: "invalid_difficulty" }
  | { kind: "deadline_passed" }
  | { kind: "busy" };

type EvaluateeFeedbackResult =
  | { kind: "ok"; session: ReviewThread }
  | { kind: "not_found" }
  | { kind: "forbidden" }
  | { kind: "evaluator_mismatch" }
  | { kind: "invalid_score" }
  | { kind: "wrong_stage" }
  | { kind: "already_registered" }
  | { kind: "busy" };

type CreateSessionResult =
  | { kind: "ok"; session: ReviewThread }
  | { kind: "already_exists"; session: ReviewThread | undefined }
  | { kind: "reviewer_already_used" }
  | { kind: "insufficient_points"; currentBalance: number }
  | { kind: "not_found" }
  | { kind: "busy" };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isBusyError(error: unknown): boolean {
  return String(error).toUpperCase().includes("SQLITE_BUSY");
}

function computeAwardedDays(
  contract: ProjectContract,
  difficulty: 1 | 2 | 3 | 4 | 5
): number {
  const deliveredAt = contract.deliveredAt ? new Date(contract.deliveredAt) : new Date();
  const acceptedAt = new Date(contract.acceptedAt);
  const actualHours = Math.max(1, (deliveredAt.getTime() - acceptedAt.getTime()) / (60 * 60 * 1000));
  const expectedHours = Math.max(1, contract.durationHours);
  const speedRatio = expectedHours / actualHours;
  const speedMultiplier = clamp(speedRatio, 0.5, 2);
  const baseDays = ProjectDifficultyDays[difficulty];
  return Math.max(1, Math.round(baseDays * speedMultiplier));
}

async function getReviewThreadById(id: number): Promise<ReviewThread | undefined> {
  const rows = await db
    .select()
    .from(schema.reviewThreads)
    .where(eq(schema.reviewThreads.id, id))
    .limit(1);
  return rows[0];
}

async function getActiveThreadForContract(contractId: number): Promise<ReviewThread | undefined> {
  const rows = await db
    .select()
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.contractId, contractId),
        isNull(schema.reviewThreads.closedAt)
      )
    )
    .limit(1);
  return rows[0];
}

async function getLatestThreadForContract(contractId: number): Promise<ReviewThread | undefined> {
  const rows = await db
    .select()
    .from(schema.reviewThreads)
    .where(eq(schema.reviewThreads.contractId, contractId))
    .orderBy(desc(schema.reviewThreads.createdAt))
    .limit(1);
  return rows[0];
}

async function getLatestClosedThreadForContract(contractId: number): Promise<ReviewThread | undefined> {
  const rows = await db
    .select()
    .from(schema.reviewThreads)
    .where(and(eq(schema.reviewThreads.contractId, contractId), isNotNull(schema.reviewThreads.closedAt)))
    .orderBy(desc(schema.reviewThreads.createdAt))
    .limit(1);
  return rows[0];
}

async function hasEvaluatorReviewedContract(
  contractId: number,
  evaluatorUserId: string
): Promise<boolean> {
  const rows = await db
    .select({ id: schema.reviewThreads.id })
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.contractId, contractId),
        eq(schema.reviewThreads.evaluatorUserId, evaluatorUserId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

async function listActiveThreadsForUser(
  guildId: string,
  userId: string,
  limit = 20
): Promise<ReviewThread[]> {
  return db
    .select()
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.guildId, guildId),
        isNull(schema.reviewThreads.closedAt),
        or(
          eq(schema.reviewThreads.evaluateeUserId, userId),
          eq(schema.reviewThreads.evaluatorUserId, userId)
        )
      )
    )
    .orderBy(desc(schema.reviewThreads.createdAt))
    .limit(limit);
}

async function listHistory(guildId: string, limit = 20): Promise<ReviewThread[]> {
  return db
    .select()
    .from(schema.reviewThreads)
    .where(eq(schema.reviewThreads.guildId, guildId))
    .orderBy(desc(schema.reviewThreads.createdAt))
    .limit(limit);
}

async function listFullHistory(guildId: string): Promise<ReviewThread[]> {
  return db
    .select()
    .from(schema.reviewThreads)
    .where(eq(schema.reviewThreads.guildId, guildId))
    .orderBy(desc(schema.reviewThreads.createdAt));
}

async function createReviewThreadSession(params: {
  guildId: string;
  contractId: number;
  evaluateeUserId: string;
  evaluatorUserId: string;
  threadId: string;
}): Promise<CreateSessionResult> {
  try {
    return await db.transaction(async (tx) => {
      const timestamp = now();

      const existing = await tx
        .select()
        .from(schema.reviewThreads)
        .where(
          and(
            eq(schema.reviewThreads.contractId, params.contractId),
            isNull(schema.reviewThreads.closedAt)
          )
        )
        .limit(1);
      if (existing[0]) {
        return { kind: "already_exists", session: existing[0] } as const;
      }

      const usedBySameEvaluator = await tx
        .select({ id: schema.reviewThreads.id })
        .from(schema.reviewThreads)
        .where(
          and(
            eq(schema.reviewThreads.contractId, params.contractId),
            eq(schema.reviewThreads.evaluatorUserId, params.evaluatorUserId)
          )
        )
        .limit(1);
      if (usedBySameEvaluator.length > 0) {
        return { kind: "reviewer_already_used" } as const;
      }

      await tx
        .insert(schema.wallets)
        .values([
          {
            guildId: params.guildId,
            userId: params.evaluateeUserId,
            balance: INITIAL_REVIEW_CREDITS,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
          {
            guildId: params.guildId,
            userId: params.evaluatorUserId,
            balance: INITIAL_REVIEW_CREDITS,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ])
        .onConflictDoNothing();

      const evaluateeWalletRows = await tx
        .select()
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.guildId, params.guildId),
            eq(schema.wallets.userId, params.evaluateeUserId)
          )
        )
        .limit(1);
      const evaluateeWallet = evaluateeWalletRows[0];
      if (!evaluateeWallet) return { kind: "not_found" } as const;
      if (evaluateeWallet.balance < REVIEW_CREDIT_COST) {
        return {
          kind: "insufficient_points",
          currentBalance: evaluateeWallet.balance,
        } as const;
      }

      const reviewDueAt = addHours(new Date(timestamp), REVIEW_DEADLINE_HOURS).toISOString();

      const inserted = await tx
        .insert(schema.reviewThreads)
        .values({
          guildId: params.guildId,
          contractId: params.contractId,
          evaluateeUserId: params.evaluateeUserId,
          evaluatorUserId: params.evaluatorUserId,
          threadId: params.threadId,
          stage: ReviewStage.PRESENTATION,
          presentation: null,
          feedback: null,
          counterFeedback: null,
          finalAnalysis: null,
          projectScore: null,
          difficulty: null,
          approved: null,
          awardedDays: null,
          reviewerScore: null,
          reviewerComment: null,
          evaluatorCompletedAt: null,
          evaluateeRatedAt: null,
          reviewDueAt,
          closedAt: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .returning({ id: schema.reviewThreads.id });

      const createdId = inserted[0]?.id;
      if (!createdId) return { kind: "not_found" } as const;

      await tx.insert(schema.walletLedger).values({
        guildId: params.guildId,
        cycleId: null,
        userId: params.evaluateeUserId,
        assignmentId: null,
        relatedUserId: params.evaluatorUserId,
        entryType: "review_escrow",
        delta: -REVIEW_CREDIT_COST,
        note: `review_escrow_session:${createdId}`,
        createdAt: timestamp,
      });

      await tx
        .update(schema.wallets)
        .set({
          balance: evaluateeWallet.balance - REVIEW_CREDIT_COST,
          updatedAt: timestamp,
        })
        .where(eq(schema.wallets.id, evaluateeWallet.id));

      const createdRows = await tx
        .select()
        .from(schema.reviewThreads)
        .where(eq(schema.reviewThreads.id, createdId))
        .limit(1);
      const created = createdRows[0];
      if (!created) return { kind: "not_found" } as const;

      return { kind: "ok", session: created } as const;
    });
  } catch (error) {
    if (isBusyError(error)) return { kind: "busy" };
    if (String(error).toLowerCase().includes("unique")) {
      return {
        kind: "already_exists",
        session: await getActiveThreadForContract(params.contractId),
      };
    }
    throw error;
  }
}

async function settleExpiredReviewDeadlines(guildId: string): Promise<number> {
  const timestamp = now();
  const expiredSessions = await db
    .select()
    .from(schema.reviewThreads)
    .where(
      and(
        eq(schema.reviewThreads.guildId, guildId),
        isNull(schema.reviewThreads.closedAt),
        isNotNull(schema.reviewThreads.reviewDueAt),
        lt(schema.reviewThreads.reviewDueAt, timestamp)
      )
    );

  let settled = 0;
  for (const session of expiredSessions) {
    try {
      const applied = await db.transaction(async (tx) => {
        const claimed = await tx
          .update(schema.reviewThreads)
          .set({
            stage: ReviewStage.EXPIRED,
            feedback: session.feedback ?? "Review deadline expired without evaluator score.",
            closedAt: timestamp,
            updatedAt: timestamp,
          })
          .where(
            and(
              eq(schema.reviewThreads.id, session.id),
              isNull(schema.reviewThreads.closedAt),
              isNotNull(schema.reviewThreads.reviewDueAt),
              lt(schema.reviewThreads.reviewDueAt, timestamp)
            )
          )
          .returning({ id: schema.reviewThreads.id });
        if (claimed.length === 0) return false;

        await tx
          .insert(schema.wallets)
          .values([
            {
              guildId,
              userId: session.evaluateeUserId,
              balance: INITIAL_REVIEW_CREDITS,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
            {
              guildId,
              userId: session.evaluatorUserId,
              balance: INITIAL_REVIEW_CREDITS,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ])
          .onConflictDoNothing();

        const evaluateeWalletRows = await tx
          .select()
          .from(schema.wallets)
          .where(
            and(
              eq(schema.wallets.guildId, guildId),
              eq(schema.wallets.userId, session.evaluateeUserId)
            )
          )
          .limit(1);
        const evaluatorWalletRows = await tx
          .select()
          .from(schema.wallets)
          .where(
            and(
              eq(schema.wallets.guildId, guildId),
              eq(schema.wallets.userId, session.evaluatorUserId)
            )
          )
          .limit(1);
        const evaluateeWallet = evaluateeWalletRows[0];
        const evaluatorWallet = evaluatorWalletRows[0];
        if (!evaluateeWallet || !evaluatorWallet) return false;

        await tx.insert(schema.walletLedger).values([
          {
            guildId,
            cycleId: null,
            userId: session.evaluateeUserId,
            assignmentId: null,
            relatedUserId: session.evaluatorUserId,
            entryType: "review_refund",
            delta: REVIEW_CREDIT_COST,
            note: `review_timeout_refund_session:${session.id}`,
            createdAt: timestamp,
          },
          {
            guildId,
            cycleId: null,
            userId: session.evaluatorUserId,
            assignmentId: null,
            relatedUserId: session.evaluateeUserId,
            entryType: "admin_adjustment",
            delta: -REVIEW_CREDIT_COST,
            note: `review_timeout_burn_session:${session.id}`,
            createdAt: timestamp,
          },
        ]);

        await tx
          .update(schema.wallets)
          .set({
            balance: evaluateeWallet.balance + REVIEW_CREDIT_COST,
            updatedAt: timestamp,
          })
          .where(eq(schema.wallets.id, evaluateeWallet.id));

        await tx
          .update(schema.wallets)
          .set({
            balance: evaluatorWallet.balance - REVIEW_CREDIT_COST,
            updatedAt: timestamp,
          })
          .where(eq(schema.wallets.id, evaluatorWallet.id));

        await tx
          .update(schema.projectContracts)
          .set({
            status: "delivered",
          })
          .where(eq(schema.projectContracts.id, session.contractId));

        return true;
      });

      if (applied) settled++;
    } catch (error) {
      if (isBusyError(error)) continue;
      throw error;
    }
  }

  return settled;
}

async function submitEvaluatorOutcome(
  sessionId: number,
  evaluatorUserId: string,
  projectScore: number,
  difficulty: number,
  summary: string | null
): Promise<EvaluatorOutcomeResult> {
  if (!Number.isInteger(projectScore) || projectScore < 0 || projectScore > 5) {
    return { kind: "invalid_score" };
  }
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) {
    return { kind: "invalid_difficulty" };
  }

  try {
    return await db.transaction(async (tx) => {
      const sessionRows = await tx
        .select()
        .from(schema.reviewThreads)
        .where(eq(schema.reviewThreads.id, sessionId))
        .limit(1);
      const session = sessionRows[0];
      if (!session || session.closedAt) return { kind: "not_found" } as const;
      if (session.evaluatorUserId !== evaluatorUserId) return { kind: "forbidden" } as const;

      const timestamp = now();
      if (session.reviewDueAt && new Date(session.reviewDueAt).getTime() < new Date(timestamp).getTime()) {
        return { kind: "deadline_passed" } as const;
      }

      const claimedRows = await tx
        .update(schema.reviewThreads)
        .set({
          evaluatorCompletedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(schema.reviewThreads.id, session.id),
            isNull(schema.reviewThreads.closedAt),
            isNull(schema.reviewThreads.evaluatorCompletedAt)
          )
        )
        .returning({ id: schema.reviewThreads.id });
      if (claimedRows.length === 0) return { kind: "not_found" } as const;

      const releaseClaim = async (): Promise<void> => {
        await tx
          .update(schema.reviewThreads)
          .set({
            evaluatorCompletedAt: null,
            updatedAt: timestamp,
          })
          .where(eq(schema.reviewThreads.id, session.id));
      };

      const contractRows = await tx
        .select()
        .from(schema.projectContracts)
        .where(eq(schema.projectContracts.id, session.contractId))
        .limit(1);
      const contract = contractRows[0];
      if (!contract) {
        await releaseClaim();
        return { kind: "not_found" } as const;
      }

      const approved = projectScore >= 3;
      let awardedDays = 0;
      const evaluatorWalletRows = await tx
        .select()
        .from(schema.wallets)
        .where(
          and(
            eq(schema.wallets.guildId, session.guildId),
            eq(schema.wallets.userId, session.evaluatorUserId)
          )
        )
        .limit(1);
      const evaluatorWallet = evaluatorWalletRows[0];
      if (!evaluatorWallet) {
        await releaseClaim();
        return { kind: "not_found" } as const;
      }

      await tx.insert(schema.walletLedger).values({
        guildId: session.guildId,
        cycleId: null,
        userId: session.evaluatorUserId,
        assignmentId: null,
        relatedUserId: session.evaluateeUserId,
        entryType: "review_reward",
        delta: REVIEW_CREDIT_COST,
        note: `review_reward_session:${session.id}`,
        createdAt: timestamp,
      });

      await tx
        .update(schema.wallets)
        .set({
          balance: evaluatorWallet.balance + REVIEW_CREDIT_COST,
          updatedAt: timestamp,
        })
        .where(eq(schema.wallets.id, evaluatorWallet.id));

      if (approved) {
        const memberRows = await tx
          .select()
          .from(schema.members)
          .where(
            and(
              eq(schema.members.guildId, session.guildId),
              eq(schema.members.userId, session.evaluateeUserId)
            )
          )
          .limit(1);
        const member = memberRows[0];
        if (!member) {
          await releaseClaim();
          return { kind: "not_found" } as const;
        }

        awardedDays = computeAwardedDays(contract, difficulty as 1 | 2 | 3 | 4 | 5);
        await tx
          .update(schema.members)
          .set({
            blackholeDeadline: addDays(new Date(member.blackholeDeadline), awardedDays).toISOString(),
          })
          .where(eq(schema.members.id, member.id));

        await tx
          .update(schema.projectContracts)
          .set({
            status: "concluded",
            concludedAt: timestamp,
          })
          .where(eq(schema.projectContracts.id, contract.id));
      } else {
        await tx
          .update(schema.projectContracts)
          .set({
            status: "delivered",
          })
          .where(eq(schema.projectContracts.id, contract.id));
      }

      await tx
        .update(schema.reviewThreads)
        .set({
          feedback: summary,
          projectScore,
          difficulty,
          approved,
          awardedDays,
          stage: approved ? ReviewStage.APPROVED : ReviewStage.REJECTED,
          evaluatorCompletedAt: timestamp,
          closedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(schema.reviewThreads.id, session.id));

      const updatedRows = await tx
        .select()
        .from(schema.reviewThreads)
        .where(eq(schema.reviewThreads.id, session.id))
        .limit(1);
      const updated = updatedRows[0];
      if (!updated) return { kind: "not_found" } as const;

      return { kind: "ok", session: updated, approved, awardedDays } as const;
    });
  } catch (error) {
    if (isBusyError(error)) return { kind: "busy" };
    throw error;
  }
}

async function submitEvaluateeEvaluation(
  sessionId: number,
  evaluateeUserId: string,
  evaluatorUserId: string,
  reviewerScore: number,
  comments: string
): Promise<EvaluateeFeedbackResult> {
  const session = await getReviewThreadById(sessionId);
  if (!session) return { kind: "not_found" };
  if (session.evaluateeUserId !== evaluateeUserId) return { kind: "forbidden" };
  if (session.evaluatorUserId !== evaluatorUserId) return { kind: "evaluator_mismatch" };
  if (
    session.stage !== ReviewStage.APPROVED &&
    session.stage !== ReviewStage.REJECTED &&
    session.stage !== ReviewStage.EXPIRED
  ) {
    return { kind: "wrong_stage" };
  }
  if (!Number.isInteger(reviewerScore) || reviewerScore < 0 || reviewerScore > 5) {
    return { kind: "invalid_score" };
  }
  if (session.reviewerScore !== null) return { kind: "already_registered" };

  try {
    const updatedIds = await db
      .update(schema.reviewThreads)
      .set({
        reviewerScore,
        reviewerComment: comments,
        finalAnalysis: comments,
        evaluateeRatedAt: now(),
        updatedAt: now(),
      })
      .where(and(eq(schema.reviewThreads.id, session.id), isNull(schema.reviewThreads.reviewerScore)))
      .returning({ id: schema.reviewThreads.id });
    if (updatedIds.length === 0) return { kind: "already_registered" };
  } catch (error) {
    if (isBusyError(error)) return { kind: "busy" };
    throw error;
  }

  const updated = await getReviewThreadById(session.id);
  if (!updated) return { kind: "not_found" };

  return { kind: "ok", session: updated };
}

export const reviewThreadService = {
  getReviewThreadById,
  getActiveThreadForContract,
  getLatestThreadForContract,
  getLatestClosedThreadForContract,
  hasEvaluatorReviewedContract,
  listActiveThreadsForUser,
  listHistory,
  listFullHistory,
  createReviewThreadSession,
  settleExpiredReviewDeadlines,
  submitEvaluatorOutcome,
  submitEvaluateeEvaluation,
};
