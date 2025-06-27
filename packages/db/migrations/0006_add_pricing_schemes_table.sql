CREATE TABLE `pricing_schemes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`service_id` integer NOT NULL UNIQUE,
	`type` text NOT NULL CHECK(`type` IN ('DISTANCE', 'PER_ITEM', 'ZONAL')),
	`params` text NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_schemes_public_id_unique` ON `pricing_schemes` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_schemes_public_id_idx` ON `pricing_schemes` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `pricing_schemes_service_id_unique` ON `pricing_schemes` (`service_id`);--> statement-breakpoint
CREATE INDEX `pricing_schemes_service_id_idx` ON `pricing_schemes` (`service_id`);--> statement-breakpoint
CREATE INDEX `pricing_schemes_type_idx` ON `pricing_schemes` (`type`);--> statement-breakpoint
CREATE INDEX `pricing_schemes_active_idx` ON `pricing_schemes` (`is_active`);