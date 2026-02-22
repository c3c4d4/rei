export const messages = {
  projectDeclared: (title: string) => `Project started: ${title}.`,
  projectAlreadyDeclared: () => `You already have an active project (open or waiting review).`,
  deliverySubmitted: () => `Project delivery submitted. It is now available in /review open.`,
  deliveryAlreadySubmitted: () => `This project is already delivered.`,
  reviewSubmitted: () => `Review submitted.`,
  reviewFlowHint: () =>
    `Use the thread for conversation. Evaluator closes with /review score, then evaluatee rates reviewer quality with /review reviewer.`,
  noProjectDeclared: () => `No open project found.`,
  provideInput: () => `Provide a link or at least one file.`,
  configUpdated: () => `Configuration updated.`,
  internalError: () => `Internal error. Logged.`,
  projectOverdueFailed: () => `Project deadline passed. The project failed and points were deducted.`,
  projectNeedsReview: () => `Your project is delivered and waiting for review.`,
  noDeliveredProject: () => `You do not have a delivered project waiting for review.`,
  projectNotFound: () => `Project not found.`,
  reviewChannelNotConfigured: () => `Review channel is not configured. Ask an admin to set it.`,
  activeReviewExists: () => `There is already an active review session for this project.`,
  reviewStartNeedsPoint: () => `You need at least 1 evaluation point to start a review.`,
  reviewerAlreadyUsed: () => `This evaluator has already reviewed this project. Pick another evaluator.`,
  evaluateSessionNotFound: () => `No active review session found for this project.`,
  evaluateClosedSessionNotFound: () => `No completed review session found for this project.`,
  evaluatorOnlyAction: () => `Only the assigned evaluator can submit this project evaluation.`,
  evaluateeOnlyAction: () => `Only the evaluatee can submit evaluator feedback.`,
  evaluatorMismatch: () => `Selected user is not the evaluator for this project session.`,
  projectScoreInvalid: () => `Project score must be between 0 and 5.`,
  reviewerScoreInvalid: () => `Reviewer score must be between 0 and 5.`,
  difficultyInvalid: () => `Difficulty must be between 1 and 5.`,
  evaluatorRewardInsufficient: (balance: number) =>
    `You need at least 1 evaluation point to complete an approved evaluation. Current balance: ${balance}.`,
  retrySoon: () => `This action conflicted with another update. Please retry in a few seconds.`,
  projectEvaluationApproved: (daysAwarded: number) =>
    `Evaluation submitted. Project approved, reviewer rewarded with 1 point, blackhole extended by ${daysAwarded} day(s).`,
  projectEvaluationRejected: () =>
    `Evaluation submitted. Project not approved. Reviewer was rewarded with 1 point. Submit improvements and get reviewed again.`,
  reviewDeadlinePassed: () =>
    `Review deadline has passed for this session. The timeout settlement was applied.`,
  reviewClaimExpired: () =>
    `Review deadline expired. Evaluatee was refunded and reviewer lost 1 point (1 point burned).`,
  evaluatorFeedbackSaved: () => `Evaluator feedback saved permanently.`,
  evaluatorFeedbackAlreadySaved: () => `Evaluator feedback for this session is already registered.`,
  freezeBlocksWork: () =>
    `You are in freeze mode. You cannot start projects or reviews until freeze ends.`,
  blackholeReached: () => `Blackhole reached. Your account has been marked for ban.`,
  freezeActivated: (days: number) => `Freeze activated for ${days} day(s).`,
  freezeInsufficient: () => `Not enough freeze days available.`,
  reviewStageOutOfOrder: () => `This step is not available in the current review stage.`,
  reviewNotFound: () => `No active review session found.`,
  reviewPermissionDenied: () => `You are not allowed to post this step in the active review.`,
  reviewApproved: (daysAwarded: number) => `Review approved. Blackhole extended by ${daysAwarded} day(s).`,
  reviewRejected: () => `Review feedback rejected. Start a new review round.`,
  blackholeStatusLine: (daysRemaining: number) => `Blackhole in ${daysRemaining} day(s).`,
  giftInvalidAmount: () => `Gift amount must be at least 1 point.`,
  giftCannotSelf: () => `You cannot gift points to yourself.`,
  giftInsufficient: (currentBalance: number) =>
    `Insufficient points. Your current balance is ${currentBalance}.`,
  giftSuccess: (recipient: string, points: number) =>
    `Gift sent: ${points} point(s) to ${recipient}.`,
  kickstartConfirmRequired: () =>
    `Kickstart is destructive. Run with confirm:true to proceed.`,
  kickstartDone: (members: number) =>
    `Kickstart completed for ${members} member(s). Legacy data cleared.`,
  noPermission: () => `No permission.`,
  guildOnly: () => `Command available only in servers.`,
} as const;
