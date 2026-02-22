CREATE UNIQUE INDEX IF NOT EXISTS `project_contracts_one_active_per_user_idx`
ON `project_contracts` (`guild_id`, `user_id`)
WHERE `status` IN ('open', 'delivered');--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS `review_threads_one_open_per_contract_idx`
ON `review_threads` (`contract_id`)
WHERE `closed_at` IS NULL;
