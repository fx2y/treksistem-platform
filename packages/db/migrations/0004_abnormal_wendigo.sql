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
	`location_lat` text,
	`location_lng` text,
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
CREATE INDEX `partners_business_registration_number_idx` ON `partners` (`business_registration_number`);--> statement-breakpoint
CREATE TABLE `pricing_schemes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`service_id` integer NOT NULL,
	`type` text NOT NULL,
	`params` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_schemes_public_id_unique` ON `pricing_schemes` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_schemes_service_id_unique` ON `pricing_schemes` (`service_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_schemes_public_id_idx` ON `pricing_schemes` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_schemes_service_id_idx` ON `pricing_schemes` (`service_id`);--> statement-breakpoint
CREATE INDEX `pricing_schemes_type_idx` ON `pricing_schemes` (`type`);--> statement-breakpoint
CREATE INDEX `pricing_schemes_active_idx` ON `pricing_schemes` (`is_active`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`partner_id` text NOT NULL,
	`name` text NOT NULL,
	`config` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_public_id_unique` ON `services` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `services_public_id_idx` ON `services` (`public_id`);--> statement-breakpoint
CREATE INDEX `services_partner_id_idx` ON `services` (`partner_id`);--> statement-breakpoint
CREATE INDEX `services_active_idx` ON `services` (`is_active`);--> statement-breakpoint
CREATE INDEX `services_name_idx` ON `services` (`name`);