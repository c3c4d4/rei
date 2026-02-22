CREATE TABLE `project_contracts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`guild_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`expected_artifact` text NOT NULL,
	`accepted_at` text NOT NULL,
	`due_at` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`delivery_link` text,
	`delivery_attachment_url` text,
	`delivered_at` text,
	`failed_at` text,
	`penalty_applied` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`guild_id`) REFERENCES `guilds`(`guild_id`) ON UPDATE no action ON DELETE no action
);
