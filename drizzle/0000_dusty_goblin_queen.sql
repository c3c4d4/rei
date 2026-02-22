CREATE TABLE `cycles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`cycle_number` integer NOT NULL,
	`phase` text NOT NULL,
	`started_at` text NOT NULL,
	`declaration_deadline` text NOT NULL,
	`production_deadline` text NOT NULL,
	`review_deadline` text NOT NULL,
	`closed_at` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`guild_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`project_id` integer NOT NULL,
	`cycle_id` integer NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`link` text,
	`attachment_url` text,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_project_idx` ON `deliveries` (`project_id`);--> statement-breakpoint
CREATE TABLE `events_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`cycle_id` integer,
	`user_id` text,
	`event_type` text NOT NULL,
	`payload` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `guilds` (
	`guild_id` text PRIMARY KEY NOT NULL,
	`announcement_channel_id` text,
	`cycle_duration_days` integer DEFAULT 7 NOT NULL,
	`declaration_deadline_hours` integer DEFAULT 24 NOT NULL,
	`review_period_hours` integer DEFAULT 48 NOT NULL,
	`cycle_start_day_of_week` integer DEFAULT 1 NOT NULL,
	`cycle_start_hour` integer DEFAULT 9 NOT NULL,
	`timezone` text DEFAULT 'America/Sao_Paulo' NOT NULL,
	`active_role_id` text,
	`observer_role_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `member_state_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`previous_state` text NOT NULL,
	`new_state` text NOT NULL,
	`reason` text NOT NULL,
	`cycle_id` integer,
	`changed_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`consecutive_failed_cycles` integer DEFAULT 0 NOT NULL,
	`joined_at` text NOT NULL,
	`last_active_at` text,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`guild_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `members_guild_user_idx` ON `members` (`guild_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cycle_id` integer NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`expected_artifact` text NOT NULL,
	`declared_at` text NOT NULL,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_cycle_user_idx` ON `projects` (`cycle_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `review_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`delivery_id` integer NOT NULL,
	`cycle_id` integer NOT NULL,
	`guild_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`assigned_at` text NOT NULL,
	`completed` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`assignment_id` integer NOT NULL,
	`delivery_id` integer NOT NULL,
	`cycle_id` integer NOT NULL,
	`guild_id` text NOT NULL,
	`reviewer_user_id` text NOT NULL,
	`content` text NOT NULL,
	`submitted_at` text NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `review_assignments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE no action
);
