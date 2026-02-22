ALTER TABLE `review_threads` ADD `review_due_at` text;--> statement-breakpoint

UPDATE `review_threads`
SET `review_due_at` = datetime(`created_at`, '+24 hours')
WHERE `review_due_at` IS NULL AND `closed_at` IS NULL;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `review_threads_due_idx`
ON `review_threads` (`guild_id`, `closed_at`, `review_due_at`);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `review_threads_contract_evaluator_idx`
ON `review_threads` (`contract_id`, `evaluator_user_id`);
