CREATE TABLE `watch_outage_notices` (
	`account_id` text NOT NULL,
	`source_id` text NOT NULL,
	`outage_started` integer NOT NULL,
	`delivery_id` text NOT NULL,
	PRIMARY KEY(`account_id`, `source_id`, `outage_started`),
	FOREIGN KEY (`account_id`) REFERENCES `watch_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_watch_outage_notices_delivery` ON `watch_outage_notices` (`delivery_id`);--> statement-breakpoint
ALTER TABLE `watch_accounts` ADD `alerts_since` integer;--> statement-breakpoint
ALTER TABLE `watch_sources` ADD `failure_days` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `watch_sources` ADD `last_failure_day` text;--> statement-breakpoint
ALTER TABLE `watch_sources` ADD `outage_started` integer;