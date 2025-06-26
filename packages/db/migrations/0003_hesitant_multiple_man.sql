CREATE TABLE `master_facilities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon_url` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`partner_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `master_facilities_public_id_unique` ON `master_facilities` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `master_facilities_public_id_idx` ON `master_facilities` (`public_id`);--> statement-breakpoint
CREATE INDEX `master_facilities_partner_id_idx` ON `master_facilities` (`partner_id`);--> statement-breakpoint
CREATE INDEX `master_facilities_active_idx` ON `master_facilities` (`is_active`);--> statement-breakpoint
CREATE INDEX `master_facilities_display_order_idx` ON `master_facilities` (`display_order`);--> statement-breakpoint
CREATE INDEX `master_facilities_name_idx` ON `master_facilities` (`name`);--> statement-breakpoint
CREATE INDEX `master_facilities_category_idx` ON `master_facilities` (`category`);--> statement-breakpoint
CREATE TABLE `master_payload_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon_url` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`partner_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`requirements` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `master_payload_types_public_id_unique` ON `master_payload_types` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `master_payload_types_public_id_idx` ON `master_payload_types` (`public_id`);--> statement-breakpoint
CREATE INDEX `master_payload_types_partner_id_idx` ON `master_payload_types` (`partner_id`);--> statement-breakpoint
CREATE INDEX `master_payload_types_active_idx` ON `master_payload_types` (`is_active`);--> statement-breakpoint
CREATE INDEX `master_payload_types_display_order_idx` ON `master_payload_types` (`display_order`);--> statement-breakpoint
CREATE INDEX `master_payload_types_name_idx` ON `master_payload_types` (`name`);--> statement-breakpoint
CREATE TABLE `master_vehicle_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`public_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`icon_url` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`partner_id` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`capabilities` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `master_vehicle_types_public_id_unique` ON `master_vehicle_types` (`public_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `master_vehicle_types_public_id_idx` ON `master_vehicle_types` (`public_id`);--> statement-breakpoint
CREATE INDEX `master_vehicle_types_partner_id_idx` ON `master_vehicle_types` (`partner_id`);--> statement-breakpoint
CREATE INDEX `master_vehicle_types_active_idx` ON `master_vehicle_types` (`is_active`);--> statement-breakpoint
CREATE INDEX `master_vehicle_types_display_order_idx` ON `master_vehicle_types` (`display_order`);--> statement-breakpoint
CREATE INDEX `master_vehicle_types_name_idx` ON `master_vehicle_types` (`name`);