import { db, schema } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { now } from "../utils/time.js";
import { EventType, MemberState, REVIEWERS_PER_DELIVERY } from "../utils/constants.js";
import { logEvent } from "./event-log.service.js";
import { memberService } from "./member.service.js";
import { logger } from "../utils/logger.js";

type ReviewAssignment = typeof schema.reviewAssignments.$inferSelect;
type Review = typeof schema.reviews.$inferSelect;

async function getAssignmentForUserAndDelivery(
  reviewerUserId: string,
  deliveryId: number
): Promise<ReviewAssignment | undefined> {
  const rows = await db
    .select()
    .from(schema.reviewAssignments)
    .where(
      and(
        eq(schema.reviewAssignments.reviewerUserId, reviewerUserId),
        eq(schema.reviewAssignments.deliveryId, deliveryId)
      )
    );
  return rows[0];
}

async function getPendingAssignments(
  guildId: string,
  userId: string,
  cycleId: number
): Promise<ReviewAssignment[]> {
  return db
    .select()
    .from(schema.reviewAssignments)
    .where(
      and(
        eq(schema.reviewAssignments.guildId, guildId),
        eq(schema.reviewAssignments.reviewerUserId, userId),
        eq(schema.reviewAssignments.cycleId, cycleId),
        eq(schema.reviewAssignments.completed, false)
      )
    );
}

async function getReviewByAssignment(assignmentId: number): Promise<Review | undefined> {
  const rows = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.assignmentId, assignmentId));
  return rows[0];
}

async function submitReview(assignment: ReviewAssignment, content: string): Promise<Review> {
  await db.insert(schema.reviews).values({
    assignmentId: assignment.id,
    deliveryId: assignment.deliveryId,
    cycleId: assignment.cycleId,
    guildId: assignment.guildId,
    reviewerUserId: assignment.reviewerUserId,
    content,
    submittedAt: now(),
  });

  await db
    .update(schema.reviewAssignments)
    .set({ completed: true })
    .where(eq(schema.reviewAssignments.id, assignment.id));

  await logEvent(assignment.guildId, EventType.REVIEW_SUBMITTED, {
    cycleId: assignment.cycleId,
    userId: assignment.reviewerUserId,
    payload: { deliveryId: assignment.deliveryId },
  });

  const rows = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.assignmentId, assignment.id));
  return rows[0];
}

async function getCompletedReviewsForCycle(cycleId: number): Promise<Review[]> {
  return db.select().from(schema.reviews).where(eq(schema.reviews.cycleId, cycleId));
}

async function assignReviewers(guildId: string, cycleId: number): Promise<void> {
  const deliveries = await db
    .select()
    .from(schema.deliveries)
    .where(eq(schema.deliveries.cycleId, cycleId));

  if (deliveries.length === 0) return;

  const allMembers = await memberService.getAllMembers(guildId);
  const assignmentCounts = new Map<string, number>();
  for (const m of allMembers) {
    assignmentCounts.set(m.userId, 0);
  }

  const shuffled = [...deliveries].sort(() => Math.random() - 0.5);

  for (const delivery of shuffled) {
    const candidates = allMembers
      .filter((m) => m.userId !== delivery.userId)
      .sort((a, b) => {
        if (a.state === MemberState.OBSERVER && b.state !== MemberState.OBSERVER) return -1;
        if (b.state === MemberState.OBSERVER && a.state !== MemberState.OBSERVER) return 1;
        return (assignmentCounts.get(a.userId) ?? 0) - (assignmentCounts.get(b.userId) ?? 0);
      });

    const reviewerCount = Math.min(REVIEWERS_PER_DELIVERY, candidates.length);

    for (let i = 0; i < reviewerCount; i++) {
      const reviewer = candidates[i];
      await db.insert(schema.reviewAssignments).values({
        deliveryId: delivery.id,
        cycleId,
        guildId,
        reviewerUserId: reviewer.userId,
        assignedAt: now(),
        completed: false,
      });

      assignmentCounts.set(reviewer.userId, (assignmentCounts.get(reviewer.userId) ?? 0) + 1);

      await logEvent(guildId, EventType.REVIEW_ASSIGNED, {
        cycleId,
        userId: reviewer.userId,
        payload: { deliveryId: delivery.id },
      });
    }
  }

  logger.info("Reviewers atribuidos.", {
    guildId,
    cycleId,
    deliveries: deliveries.length,
    assignments: Array.from(assignmentCounts.values()).reduce((a, b) => a + b, 0),
  });
}

export {
  assignReviewers,
  getAssignmentForUserAndDelivery,
  getPendingAssignments,
  getReviewByAssignment,
  submitReview,
  getCompletedReviewsForCycle,
};
