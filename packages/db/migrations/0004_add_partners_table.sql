CREATE TABLE `partners` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`owner_user_id` integer NOT NULL,
	`name` text NOT NULL,
	`business_type` text,
	`description` text,
	`address` text,
	`phone_number` text,
	`email` text,
	`website_url` text,
	`logo_url` text,
	`location_lat` real,
	`location_lng` real,
	`business_registration_number` text,
	`tax_identification_number` text,
	`subscription_tier` text DEFAULT 'BASIC' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`max_drivers` integer DEFAULT 10 NOT NULL,
	`max_vehicles` integer DEFAULT 5 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `partners_public_id_unique` ON `partners` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `partners_public_id_idx` ON `partners` (`public_id`);--> statement-breakpoint
CREATE INDEX `partners_owner_user_id_idx` ON `partners` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `partners_active_idx` ON `partners` (`is_active`);--> statement-breakpoint
CREATE INDEX `partners_subscription_tier_idx` ON `partners` (`subscription_tier`);--> statement-breakpoint
CREATE INDEX `partners_business_type_idx` ON `partners` (`business_type`);--> statement-breakpoint
CREATE INDEX `partners_email_idx` ON `partners` (`email`);--> statement-breakpoint
CREATE INDEX `partners_business_registration_number_idx` ON `partners` (`business_registration_number`);