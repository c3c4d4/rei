import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

export const guilds = sqliteTable("guilds", {
  guildId: text("guild_id").primaryKey(),
  announcementChannelId: text("announcement_channel_id"),
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
  },
  (table) => [uniqueIndex("members_guild_user_idx").on(table.guildId, table.userId)]
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

export const teachbacks = sqliteTable("teachbacks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  cycleId: integer("cycle_id").notNull().references(() => cycles.id),
  guildId: text("guild_id").notNull(),
  userId: text("user_id").notNull(),
  topic: text("topic").notNull(),
  content: text("content").notNull(),
  registeredAt: text("registered_at").notNull(),
});

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
      "teachback_registered",
      "member_state_changed",
      "reminder_sent",
      "report_generated",
      "config_updated",
    ],
  }).notNull(),
  payload: text("payload"),
  createdAt: text("created_at").notNull(),
});
