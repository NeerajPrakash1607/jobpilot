CREATE TABLE `watch_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`preferences` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'inactive' NOT NULL,
	`opted_at` integer,
	`unsubscribe_hash` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_watch_accounts_status_opted` ON `watch_accounts` (`status`,`opted_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watch_accounts_unsubscribe` ON `watch_accounts` (`unsubscribe_hash`);--> statement-breakpoint
CREATE TABLE `watch_delivered_jobs` (
	`account_id` text NOT NULL,
	`job_id` text NOT NULL,
	`delivery_id` text NOT NULL,
	PRIMARY KEY(`account_id`, `job_id`),
	FOREIGN KEY (`account_id`) REFERENCES `watch_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `watch_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`day` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`payload` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `watch_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watch_deliveries_account_day` ON `watch_deliveries` (`account_id`,`day`);--> statement-breakpoint
CREATE INDEX `idx_watch_deliveries_state` ON `watch_deliveries` (`state`);--> statement-breakpoint
CREATE TABLE `watch_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `watch_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_watch_requests_account_url` ON `watch_requests` (`account_id`,`url`);--> statement-breakpoint
CREATE TABLE `watch_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `watch_accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_watch_sessions_expiry` ON `watch_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `watch_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`last_attempt` integer,
	`last_success` integer,
	`status` text DEFAULT 'unchecked' NOT NULL,
	`partial` integer DEFAULT 0 NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`skipped` integer DEFAULT 0 NOT NULL,
	`lock_token` text,
	`locked_until` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `watch_system` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `watch_vacancies` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`payload` text NOT NULL,
	`first_seen` integer NOT NULL,
	`last_seen` integer NOT NULL,
	`misses` integer DEFAULT 0 NOT NULL,
	`open` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_watch_vacancies_source_open` ON `watch_vacancies` (`source_id`,`open`);