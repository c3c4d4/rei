CREATE TABLE `discord_scheduled_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`cycle_id` integer NOT NULL,
	`milestone` text NOT NULL,
	`discord_event_id` text NOT NULL,
	`synced_at` text NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`guild_id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cycle_id`) REFERENCES `cycles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_sched_cycle_milestone_idx` ON `discord_scheduled_events` (`cycle_id`,`milestone`);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_sched_event_id_idx` ON `discord_scheduled_events` (`discord_event_id`);
