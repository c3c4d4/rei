import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const guilds = sqliteTable("guilds", {
  guildId: text("guild_id").primaryKey(),
  announcementChannelId: text("announcement_channel_id"),
  reviewChannelId: text("review_channel_id"),
  cycleDurationDays: integer("cycle_duration_days").notNull().default(15),
  declarationDeadlineHours: integer("declaration_deadline_hours").notNull().default(24),
  reviewPeriodHours: integer("review_period_hours").notNull().default(168),
  cycleStartDayOfWeek: integer("cycle_start_day_of_week").notNull().default(1),
  cycleStartHour: integer("cycle_start_hour").notNull().default(9),
  timezone: text("timezone").notNull().default("America/Sao_Paulo"),
  activeRoleId: text("active_role_id"),
  observerRoleId: text("observer_role_id"),
  createdAt: text("created_at").notNull(),
});

export const cycles = sqliteTable("cycles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull().references(() => guilds.guildId),
  cycleNumber: integer("cycle_number").notNull(),
  phase: text("phase", {
    enum: ["declaration", "production", "review", "closed"],
  }).notNull(),
  startedAt: text("started_at").notNull(),
  declarationDeadline: text("declaration_deadline").notNull(),
  productionDeadline: text("production_deadline").notNull(),
  reviewDeadline: text("review_deadline").notNull(),
  closedAt: text("closed_at"),
});

export const members = sqliteTable(
  "members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull().references(() => guilds.guildId),
    userId: text("user_id").notNull(),
    state: text("state", { enum: ["active", "observer"] }).notNull().default("active"),
    consecutiveFailedCycles: integer("consecutive_failed_cycles").notNull().default(0),
    joinedAt: text("joined_at").notNull(),
    lastActiveAt: text("last_active_at"),
    blackholeDeadline: text("blackhole_deadline").notNull(),
    freezeDaysAvailable: integer("freeze_days_available").notNull().default(30),
    freezeActiveUntil: text("freeze_active_until"),
    freezeAllowanceResetAt: text("freeze_allowance_reset_at").notNull(),
    bannedAt: text("banned_at"),
  },
  (table) => [uniqueIndex("members_guild_user_idx").on(table.guildId, table.userId)]
);

export const wallets = sqliteTable(
  "wallets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull().references(() => guilds.guildId),
    userId: text("user_id").notNull(),
    balance: integer("balance").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("wallets_guild_user_idx").on(table.guildId, table.userId)]
);

export const projectContracts = sqliteTable("project_contracts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull().references(() => guilds.guildId),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  requirement: text("requirement").notNull(),
  expectedArtifact: text("expected_artifact").notNull(),
  durationHours: integer("duration_hours").notNull(),
  acceptedAt: text("accepted_at").notNull(),
  dueAt: text("due_at").notNull(),
  status: text("status", { enum: ["open", "delivered", "concluded", "failed"] }).notNull().default("open"),
  deliveryLink: text("delivery_link"),
  deliveryAttachmentUrl: text("delivery_attachment_url"),
  deliveredAt: text("delivered_at"),
  concludedAt: text("concluded_at"),
  failedAt: text("failed_at"),
  penaltyApplied: integer("penalty_applied", { mode: "boolean" }).notNull().default(false),
});

export const reviewThreads = sqliteTable(
  "review_threads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull().references(() => guilds.guildId),
    contractId: integer("contract_id").notNull().references(() => projectContracts.id),
    evaluateeUserId: text("evaluatee_user_id").notNull(),
    evaluatorUserId: text("evaluator_user_id").notNull(),
    threadId: text("thread_id").notNull(),
    stage: text("stage", {
      enum: ["presentation", "feedback", "counter_feedback", "final_analysis", "approved", "rejected", "expired"],
    }).notNull().default("presentation"),
    presentation: text("presentation"),
    feedback: text("feedback"),
    counterFeedback: text("counter_feedback"),
    finalAnalysis: text("final_analysis"),
    projectScore: integer("project_score"),
    difficulty: integer("difficulty"),
    approved: integer("approved", { mode: "boolean" }),
    awardedDays: integer("awarded_days"),
    reviewerScore: integer("reviewer_score"),
    reviewerComment: text("reviewer_comment"),
    evaluatorCompletedAt: text("evaluator_completed_at"),
    evaluateeRatedAt: text("evaluatee_rated_at"),
    reviewDueAt: text("review_due_at"),
    closedAt: text("closed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("review_threads_thread_idx").on(table.threadId),
    uniqueIndex("review_threads_contract_thread_idx").on(table.contractId, table.threadId),
  ]
);

export const projects = sqliteTable(
  "projects",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cycleId: integer("cycle_id").notNull().references(() => cycles.id),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    expectedArtifact: text("expected_artifact").notNull(),
    declaredAt: text("declared_at").notNull(),
  },
  (table) => [uniqueIndex("projects_cycle_user_idx").on(table.cycleId, table.userId)]
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    projectId: integer("project_id").notNull().references(() => projects.id),
    cycleId: integer("cycle_id").notNull().references(() => cycles.id),
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    link: text("link"),
    attachmentUrl: text("attachment_url"),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [uniqueIndex("deliveries_project_idx").on(table.projectId)]
);

export const reviewAssignments = sqliteTable(
  "review_assignments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    deliveryId: integer("delivery_id").notNull().references(() => deliveries.id),
    cycleId: integer("cycle_id").notNull(),
    guildId: text("guild_id").notNull(),
    reviewerUserId: text("reviewer_user_id").notNull(),
    assignedAt: text("assigned_at").notNull(),
    completed: integer("completed", { mode: "boolean" }).notNull().default(false),
  },
  (table) => [uniqueIndex("review_assignments_delivery_reviewer_idx").on(table.deliveryId, table.reviewerUserId)]
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    assignmentId: integer("assignment_id").notNull().references(() => reviewAssignments.id),
    deliveryId: integer("delivery_id").notNull().references(() => deliveries.id),
    cycleId: integer("cycle_id").notNull(),
    guildId: text("guild_id").notNull(),
    reviewerUserId: text("reviewer_user_id").notNull(),
    content: text("content").notNull(),
    submittedAt: text("submitted_at").notNull(),
  },
  (table) => [uniqueIndex("reviews_assignment_idx").on(table.assignmentId)]
);

export const walletLedger = sqliteTable(
  "wallet_ledger",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull(),
    cycleId: integer("cycle_id"),
    userId: text("user_id").notNull(),
    assignmentId: integer("assignment_id").references(() => reviewAssignments.id),
    relatedUserId: text("related_user_id"),
    entryType: text("entry_type", {
      enum: ["seed", "review_escrow", "review_reward", "review_refund", "admin_adjustment"],
    }).notNull(),
    delta: integer("delta").notNull(),
    note: text("note"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("wallet_ledger_assignment_entry_idx").on(table.assignmentId, table.entryType)]
);

export const discordScheduledEvents = sqliteTable(
  "discord_scheduled_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    guildId: text("guild_id").notNull().references(() => guilds.guildId),
    cycleId: integer("cycle_id").notNull().references(() => cycles.id),
    milestone: text("milestone", {
      enum: ["declaration_deadline", "production_deadline", "review_deadline"],
    }).notNull(),
    discordEventId: text("discord_event_id").notNull(),
    syncedAt: text("synced_at").notNull(),
  },
  (table) => [
    uniqueIndex("discord_sched_cycle_milestone_idx").on(table.cycleId, table.milestone),
    uniqueIndex("discord_sched_event_id_idx").on(table.discordEventId),
  ]
);

export const memberStateHistory = sqliteTable("member_state_history", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  previousState: text("previous_state").notNull(),
  newState: text("new_state").notNull(),
  reason: text("reason").notNull(),
  cycleId: integer("cycle_id"),
  changedAt: text("changed_at").notNull(),
});

export const eventsLog = sqliteTable("events_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  guildId: text("guild_id").notNull(),
  cycleId: integer("cycle_id"),
  userId: text("user_id"),
  eventType: text("event_type", {
    enum: [
      "cycle_opened",
      "cycle_closed",
      "declaration_submitted",
      "declaration_deadline_passed",
      "delivery_submitted",
      "review_assigned",
      "review_submitted",
      "member_state_changed",
      "reminder_sent",
      "report_generated",
      "config_updated",
    ],
  }).notNull(),
  payload: text("payload"),
  createdAt: text("created_at").notNull(),
});
