import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db/index.js";
import { INITIAL_REVIEW_CREDITS, REVIEW_CREDIT_COST } from "../utils/constants.js";
import { now } from "../utils/time.js";
import { logger } from "../utils/logger.js";

type Wallet = typeof schema.wallets.$inferSelect;
type LedgerEntry = typeof schema.walletLedger.$inferSelect;

const LedgerEntryType = {
  SEED: "seed",
  REVIEW_ESCROW: "review_escrow",
  REVIEW_REWARD: "review_reward",
  REVIEW_REFUND: "review_refund",
  ADMIN_ADJUSTMENT: "admin_adjustment",
} as const;

function isBusyError(error: unknown): boolean {
  return String(error).toUpperCase().includes("SQLITE_BUSY");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBusyRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 4,
  backoffMs = 20
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxAttempts || !isBusyError(error)) {
        throw error;
      }
      await sleep(backoffMs * attempt);
    }
  }
}

async function getOrCreateWallet(guildId: string, userId: string): Promise<Wallet> {
  const createdAt = now();

  await withBusyRetry(async () => {
    await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.wallets)
        .values({
          guildId,
          userId,
          balance: INITIAL_REVIEW_CREDITS,
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing()
        .returning({ id: schema.wallets.id });

      if (inserted.length > 0) {
        await tx.insert(schema.walletLedger).values({
          guildId,
          cycleId: null,
          userId,
          assignmentId: null,
          relatedUserId: null,
          entryType: LedgerEntryType.SEED,
          delta: INITIAL_REVIEW_CREDITS,
          note: "initial_seed",
          createdAt,
        });
      }
    });
  });

  const rows = await db
    .select()
    .from(schema.wallets)
    .where(and(eq(schema.wallets.guildId, guildId), eq(schema.wallets.userId, userId)))
    .limit(1);

  if (!rows[0]) {
    throw new Error(`wallet_not_found guild=${guildId} user=${userId}`);
  }

  return rows[0];
}

async function getBalance(guildId: string, userId: string): Promise<number> {
  const wallet = await getOrCreateWallet(guildId, userId);
  return wallet.balance;
}

async function applyBalanceDelta(
  guildId: string,
  userId: string,
  delta: number,
  opts?: {
    cycleId?: number | null;
    assignmentId?: number | null;
    relatedUserId?: string | null;
    note?: string | null;
    entryType?: "admin_adjustment";
  }
): Promise<number> {
  await getOrCreateWallet(guildId, userId);
  const timestamp = now();

  return withBusyRetry(async () =>
    db.transaction(async (tx) => {
      const walletRows = await tx
        .select()
        .from(schema.wallets)
        .where(and(eq(schema.wallets.guildId, guildId), eq(schema.wallets.userId, userId)))
        .limit(1);
      const wallet = walletRows[0];
      if (!wallet) return 0;

      const inserted = await tx
        .insert(schema.walletLedger)
        .values({
          guildId,
          cycleId: opts?.cycleId ?? null,
          userId,
          assignmentId: opts?.assignmentId ?? null,
          relatedUserId: opts?.relatedUserId ?? null,
          entryType: opts?.entryType ?? LedgerEntryType.ADMIN_ADJUSTMENT,
          delta,
          note: opts?.note ?? null,
          createdAt: timestamp,
        })
        .returning({ id: schema.walletLedger.id });

      if (inserted.length === 0) return 0;

      await tx
        .update(schema.wallets)
        .set({
          balance: wallet.balance + delta,
          updatedAt: timestamp,
        })
        .where(eq(schema.wallets.id, wallet.id));

      return delta;
    })
  );
}

async function getBalances(guildId: string, userIds: string[]): Promise<Map<string, number>> {
  const uniqueUserIds = Array.from(new Set(userIds));
  if (uniqueUserIds.length === 0) return new Map();

  await Promise.all(uniqueUserIds.map((userId) => getOrCreateWallet(guildId, userId)));

  const rows = await db
    .select({
      userId: schema.wallets.userId,
      balance: schema.wallets.balance,
    })
    .from(schema.wallets)
    .where(
      and(
        eq(schema.wallets.guildId, guildId),
        inArray(schema.wallets.userId, uniqueUserIds)
      )
    );

  return new Map(rows.map((row) => [row.userId, row.balance]));
}

async function getFundedAssignmentIds(guildId: string, cycleId: number): Promise<Set<number>> {
  const entries = await db
    .select({
      assignmentId: schema.walletLedger.assignmentId,
      entryType: schema.walletLedger.entryType,
    })
    .from(schema.walletLedger)
    .where(
      and(
        eq(schema.walletLedger.guildId, guildId),
        eq(schema.walletLedger.cycleId, cycleId),
        inArray(schema.walletLedger.entryType, [
          LedgerEntryType.REVIEW_ESCROW,
          LedgerEntryType.REVIEW_REFUND,
        ])
      )
    );

  const fundedAssignmentIds = new Set<number>();
  for (const entry of entries) {
    if (!entry.assignmentId) continue;

    if (entry.entryType === LedgerEntryType.REVIEW_ESCROW) {
      fundedAssignmentIds.add(entry.assignmentId);
    } else if (entry.entryType === LedgerEntryType.REVIEW_REFUND) {
      fundedAssignmentIds.delete(entry.assignmentId);
    }
  }

  return fundedAssignmentIds;
}

async function reserveReviewCreditForAssignment(
  guildId: string,
  cycleId: number,
  assignmentId: number,
  revieweeUserId: string,
  reviewerUserId: string
): Promise<boolean> {
  await getOrCreateWallet(guildId, revieweeUserId);
  const timestamp = now();

  return withBusyRetry(async () => db.transaction(async (tx) => {
    const existingEscrow = await tx
      .select({ id: schema.walletLedger.id })
      .from(schema.walletLedger)
      .where(
        and(
          eq(schema.walletLedger.guildId, guildId),
          eq(schema.walletLedger.assignmentId, assignmentId),
          eq(schema.walletLedger.entryType, LedgerEntryType.REVIEW_ESCROW)
        )
      )
      .limit(1);
    if (existingEscrow.length > 0) return true;

    const walletRows = await tx
      .select()
      .from(schema.wallets)
      .where(and(eq(schema.wallets.guildId, guildId), eq(schema.wallets.userId, revieweeUserId)))
      .limit(1);
    const wallet = walletRows[0];
    if (!wallet) return false;
    if (wallet.balance < REVIEW_CREDIT_COST) return false;

    const insertedEscrow = await tx
      .insert(schema.walletLedger)
      .values({
        guildId,
        cycleId,
        userId: revieweeUserId,
        assignmentId,
        relatedUserId: reviewerUserId,
        entryType: LedgerEntryType.REVIEW_ESCROW,
        delta: -REVIEW_CREDIT_COST,
        note: "review_funding",
        createdAt: timestamp,
      })
      .onConflictDoNothing()
      .returning({ id: schema.walletLedger.id });

    if (insertedEscrow.length === 0) return true;

    await tx
      .update(schema.wallets)
      .set({
        balance: wallet.balance - REVIEW_CREDIT_COST,
        updatedAt: timestamp,
      })
      .where(eq(schema.wallets.id, wallet.id));

    return true;
  }));
}

async function rewardReviewerForAssignment(
  guildId: string,
  cycleId: number,
  assignmentId: number,
  reviewerUserId: string,
  revieweeUserId: string
): Promise<boolean> {
  await getOrCreateWallet(guildId, reviewerUserId);
  const timestamp = now();

  return withBusyRetry(async () => db.transaction(async (tx) => {
    const escrow = await tx
      .select({ id: schema.walletLedger.id })
      .from(schema.walletLedger)
      .where(
        and(
          eq(schema.walletLedger.guildId, guildId),
          eq(schema.walletLedger.assignmentId, assignmentId),
          eq(schema.walletLedger.entryType, LedgerEntryType.REVIEW_ESCROW)
        )
      )
      .limit(1);
    if (escrow.length === 0) {
      logger.warn("Cannot reward review without escrow.", {
        guildId,
        cycleId,
        assignmentId,
        reviewerUserId,
      });
      return false;
    }

    const refunded = await tx
      .select({ id: schema.walletLedger.id })
      .from(schema.walletLedger)
      .where(
        and(
          eq(schema.walletLedger.guildId, guildId),
          eq(schema.walletLedger.assignmentId, assignmentId),
          eq(schema.walletLedger.entryType, LedgerEntryType.REVIEW_REFUND)
        )
      )
      .limit(1);
    if (refunded.length > 0) return false;

    const insertedReward = await tx
      .insert(schema.walletLedger)
      .values({
        guildId,
        cycleId,
        userId: reviewerUserId,
        assignmentId,
        relatedUserId: revieweeUserId,
        entryType: LedgerEntryType.REVIEW_REWARD,
        delta: REVIEW_CREDIT_COST,
        note: "review_completed_reward",
        createdAt: timestamp,
      })
      .onConflictDoNothing()
      .returning({ id: schema.walletLedger.id });

    if (insertedReward.length === 0) return true;

    const walletRows = await tx
      .select()
      .from(schema.wallets)
      .where(and(eq(schema.wallets.guildId, guildId), eq(schema.wallets.userId, reviewerUserId)))
      .limit(1);
    const wallet = walletRows[0];
    if (!wallet) return false;

    await tx
      .update(schema.wallets)
      .set({
        balance: wallet.balance + REVIEW_CREDIT_COST,
        updatedAt: timestamp,
      })
      .where(eq(schema.wallets.id, wallet.id));

    return true;
  }));
}

async function refundPendingAssignmentEscrows(guildId: string, cycleId: number): Promise<number> {
  const pendingAssignments = await db
    .select({ id: schema.reviewAssignments.id })
    .from(schema.reviewAssignments)
    .where(
      and(
        eq(schema.reviewAssignments.guildId, guildId),
        eq(schema.reviewAssignments.cycleId, cycleId),
        eq(schema.reviewAssignments.completed, false)
      )
    );

  const pendingAssignmentIds = pendingAssignments.map((item) => item.id);
  if (pendingAssignmentIds.length === 0) return 0;

  const escrows = await db
    .select()
    .from(schema.walletLedger)
    .where(
      and(
        eq(schema.walletLedger.guildId, guildId),
        eq(schema.walletLedger.cycleId, cycleId),
        eq(schema.walletLedger.entryType, LedgerEntryType.REVIEW_ESCROW),
        inArray(schema.walletLedger.assignmentId, pendingAssignmentIds)
      )
    );

  let refundedCount = 0;
  for (const escrow of escrows) {
    const assignmentId = escrow.assignmentId;
    if (assignmentId === null) continue;
    const timestamp = now();

    const refunded = await withBusyRetry(async () => db.transaction(async (tx) => {
      const existingRefund = await tx
        .select({ id: schema.walletLedger.id })
        .from(schema.walletLedger)
        .where(
          and(
            eq(schema.walletLedger.guildId, guildId),
            eq(schema.walletLedger.assignmentId, assignmentId),
            eq(schema.walletLedger.entryType, LedgerEntryType.REVIEW_REFUND)
          )
        )
        .limit(1);
      if (existingRefund.length > 0) return false;

      const rewarded = await tx
        .select({ id: schema.walletLedger.id })
        .from(schema.walletLedger)
        .where(
          and(
            eq(schema.walletLedger.guildId, guildId),
            eq(schema.walletLedger.assignmentId, assignmentId),
            eq(schema.walletLedger.entryType, LedgerEntryType.REVIEW_REWARD)
          )
        )
        .limit(1);
      if (rewarded.length > 0) return false;

      const walletRows = await tx
        .select()
        .from(schema.wallets)
        .where(and(eq(schema.wallets.guildId, guildId), eq(schema.wallets.userId, escrow.userId)))
        .limit(1);
      const wallet = walletRows[0];
      if (!wallet) return false;

      const insertedRefund = await tx
        .insert(schema.walletLedger)
        .values({
          guildId,
          cycleId,
          userId: escrow.userId,
          assignmentId,
          relatedUserId: escrow.relatedUserId,
          entryType: LedgerEntryType.REVIEW_REFUND,
          delta: REVIEW_CREDIT_COST,
          note: "review_escrow_refund",
          createdAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({ id: schema.walletLedger.id });
      if (insertedRefund.length === 0) return false;

      await tx
        .update(schema.wallets)
        .set({
          balance: wallet.balance + REVIEW_CREDIT_COST,
          updatedAt: timestamp,
        })
        .where(eq(schema.wallets.id, wallet.id));

      return true;
    }));

    if (refunded) refundedCount++;
  }

  if (refundedCount > 0) {
    logger.info("Pending review escrows refunded.", {
      guildId,
      cycleId,
      refundedAssignments: refundedCount,
    });
  }

  return refundedCount;
}

async function transferBalance(
  guildId: string,
  fromUserId: string,
  toUserId: string,
  amount: number,
  opts?: { reason?: "gift" | "review_reward" }
): Promise<
  | { kind: "ok"; fromBalance: number; toBalance: number }
  | { kind: "invalid_amount" }
  | { kind: "same_user" }
  | { kind: "insufficient_balance"; currentBalance: number }
> {
  if (!Number.isInteger(amount) || amount <= 0) {
    return { kind: "invalid_amount" };
  }

  if (fromUserId === toUserId) {
    return { kind: "same_user" };
  }

  await Promise.all([getOrCreateWallet(guildId, fromUserId), getOrCreateWallet(guildId, toUserId)]);

  const timestamp = now();
  const reason = opts?.reason ?? "gift";
  const senderNote = reason === "review_reward" ? "review_reward_paid" : "gift_sent";
  const receiverNote = reason === "review_reward" ? "review_reward_received" : "gift_received";
  return withBusyRetry(async () => db.transaction(async (tx) => {
    const [fromWallet] = await tx
      .select()
      .from(schema.wallets)
      .where(and(eq(schema.wallets.guildId, guildId), eq(schema.wallets.userId, fromUserId)))
      .limit(1);

    const [toWallet] = await tx
      .select()
      .from(schema.wallets)
      .where(and(eq(schema.wallets.guildId, guildId), eq(schema.wallets.userId, toUserId)))
      .limit(1);

    if (!fromWallet || !toWallet) {
      return { kind: "insufficient_balance", currentBalance: 0 } as const;
    }

    if (fromWallet.balance < amount) {
      return { kind: "insufficient_balance", currentBalance: fromWallet.balance } as const;
    }

    await tx.insert(schema.walletLedger).values([
      {
        guildId,
        cycleId: null,
        userId: fromUserId,
        assignmentId: null,
        relatedUserId: toUserId,
        entryType: LedgerEntryType.ADMIN_ADJUSTMENT,
        delta: -amount,
        note: senderNote,
        createdAt: timestamp,
      },
      {
        guildId,
        cycleId: null,
        userId: toUserId,
        assignmentId: null,
        relatedUserId: fromUserId,
        entryType: LedgerEntryType.ADMIN_ADJUSTMENT,
        delta: amount,
        note: receiverNote,
        createdAt: timestamp,
      },
    ]);

    await tx
      .update(schema.wallets)
      .set({
        balance: fromWallet.balance - amount,
        updatedAt: timestamp,
      })
      .where(eq(schema.wallets.id, fromWallet.id));

    await tx
      .update(schema.wallets)
      .set({
        balance: toWallet.balance + amount,
        updatedAt: timestamp,
      })
      .where(eq(schema.wallets.id, toWallet.id));

    return {
      kind: "ok",
      fromBalance: fromWallet.balance - amount,
      toBalance: toWallet.balance + amount,
    } as const;
  }));
}

export const walletService = {
  getOrCreateWallet,
  getBalance,
  applyBalanceDelta,
  getBalances,
  getFundedAssignmentIds,
  reserveReviewCreditForAssignment,
  rewardReviewerForAssignment,
  refundPendingAssignmentEscrows,
  transferBalance,
};
