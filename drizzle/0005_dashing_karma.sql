CREATE TABLE `review_threads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`contract_id` integer NOT NULL,
	`evaluatee_user_id` text NOT NULL,
	`evaluator_user_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`stage` text DEFAULT 'presentation' NOT NULL,
	`presentation` text,
	`feedback` text,
	`counter_feedback` text,
	`final_analysis` text,
	`difficulty` integer,
	`approved` integer,
	`awarded_days` integer,
	`closed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`guild_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`contract_id`) REFERENCES `project_contracts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_threads_thread_idx` ON `review_threads` (`thread_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_threads_contract_thread_idx` ON `review_threads` (`contract_id`,`thread_id`);--> statement-breakpoint
ALTER TABLE `guilds` ADD `review_channel_id` text;--> statement-breakpoint
ALTER TABLE `members` ADD `blackhole_deadline` text NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';--> statement-breakpoint
ALTER TABLE `members` ADD `freeze_days_available` integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `members` ADD `freeze_active_until` text;--> statement-breakpoint
ALTER TABLE `members` ADD `freeze_allowance_reset_at` text NOT NULL DEFAULT '1970-01-01T00:00:00.000Z';--> statement-breakpoint
ALTER TABLE `members` ADD `banned_at` text;--> statement-breakpoint
ALTER TABLE `project_contracts` ADD `requirement` text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE `project_contracts` ADD `duration_hours` integer NOT NULL DEFAULT 168;--> statement-breakpoint
ALTER TABLE `project_contracts` ADD `concluded_at` text;--> statement-breakpoint
UPDATE `members`
SET
  `blackhole_deadline` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+60 days'),
  `freeze_allowance_reset_at` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+1 year')
WHERE `blackhole_deadline` = '1970-01-01T00:00:00.000Z'
   OR `freeze_allowance_reset_at` = '1970-01-01T00:00:00.000Z';--> statement-breakpoint
UPDATE `project_contracts`
SET `requirement` = 'Legacy requirement',
    `duration_hours` = 168
WHERE `requirement` = '';
