CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`partner_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`partner_id`) REFERENCES `partners`(`public_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_public_id_unique` ON `services` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `services_public_id_idx` ON `services` (`public_id`);--> statement-breakpoint
CREATE INDEX `services_partner_id_idx` ON `services` (`partner_id`);--> statement-breakpoint
CREATE INDEX `services_active_idx` ON `services` (`is_active`);--> statement-breakpoint
CREATE INDEX `services_name_idx` ON `services` (`name`);