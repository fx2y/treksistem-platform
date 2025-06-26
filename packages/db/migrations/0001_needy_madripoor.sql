CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`email` text,
	`ip_address` text,
	`user_agent` text,
	`success` integer NOT NULL,
	`details` text,
	`timestamp` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_logs_user_id_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_timestamp_idx` ON `audit_logs` (`timestamp`);--> statement-breakpoint
CREATE INDEX `audit_logs_email_idx` ON `audit_logs` (`email`);--> statement-breakpoint
CREATE INDEX `audit_logs_ip_address_idx` ON `audit_logs` (`ip_address`);--> statement-breakpoint
CREATE TABLE `session_revocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`jti` text NOT NULL,
	`user_id` integer,
	`expires_at` integer NOT NULL,
	`revoked_at` integer NOT NULL,
	`reason` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_revocations_jti_unique` ON `session_revocations` (`jti`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_revocations_jti_idx` ON `session_revocations` (`jti`);--> statement-breakpoint
CREATE INDEX `session_revocations_expires_at_idx` ON `session_revocations` (`expires_at`);--> statement-breakpoint
CREATE INDEX `session_revocations_user_id_idx` ON `session_revocations` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `last_activity` integer;--> statement-breakpoint
CREATE INDEX `users_last_activity_idx` ON `users` (`last_activity`);