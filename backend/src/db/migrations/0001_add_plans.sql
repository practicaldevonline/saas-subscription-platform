-- Add plans table
CREATE TABLE IF NOT EXISTS `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`monthly_price` integer NOT NULL,
	`stripe_price_id_monthly` text,
	`yearly_price` integer NOT NULL,
	`stripe_price_id_yearly` text,
	`features` text DEFAULT '[]' NOT NULL,
	`max_users` integer,
	`max_team_members` integer,
	`is_active` integer DEFAULT 1 NOT NULL,
	`is_popular` integer DEFAULT 0 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `plans_slug_unique` ON `plans` (`slug`);
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD COLUMN `plan_id` text REFERENCES `plans`(`id`);
--> statement-breakpoint
ALTER TABLE `subscriptions` ADD COLUMN `billing_interval` text;
