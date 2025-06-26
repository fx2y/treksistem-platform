PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_user_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`context_id` text,
	`granted_at` integer NOT NULL,
	`granted_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_roles`("id", "user_id", "role", "context_id", "granted_at", "granted_by", "created_at", "updated_at") SELECT "id", "user_id", "role", "context_id", "granted_at", "granted_by", "created_at", "updated_at" FROM `user_roles`;--> statement-breakpoint
DROP TABLE `user_roles`;--> statement-breakpoint
ALTER TABLE `__new_user_roles` RENAME TO `user_roles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_composite_idx` ON `user_roles` (`user_id`,`role`,`context_id`);--> statement-breakpoint
CREATE INDEX `user_roles_context_id_idx` ON `user_roles` (`context_id`);--> statement-breakpoint
CREATE INDEX `user_roles_granted_by_idx` ON `user_roles` (`granted_by`);--> statement-breakpoint
CREATE INDEX `user_roles_granted_at_idx` ON `user_roles` (`granted_at`);