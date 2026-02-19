DELETE FROM `review_assignments`
WHERE `id` NOT IN (
  SELECT MIN(`id`)
  FROM `review_assignments`
  GROUP BY `delivery_id`, `reviewer_user_id`
);
--> statement-breakpoint
DELETE FROM `reviews`
WHERE `id` NOT IN (
  SELECT MIN(`id`)
  FROM `reviews`
  GROUP BY `assignment_id`
);
--> statement-breakpoint
UPDATE `review_assignments`
SET `completed` = true
WHERE `id` IN (SELECT `assignment_id` FROM `reviews`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `review_assignments_delivery_reviewer_idx`
ON `review_assignments` (`delivery_id`, `reviewer_user_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `reviews_assignment_idx`
ON `reviews` (`assignment_id`);
