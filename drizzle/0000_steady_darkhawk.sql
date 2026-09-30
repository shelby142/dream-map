CREATE TABLE `dreamers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_example` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dreams` (
	`id` text PRIMARY KEY NOT NULL,
	`dreamer_id` text NOT NULL,
	`topic` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`hashtag` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'dreamed' NOT NULL,
	`location_name` text NOT NULL,
	`location_lat` real NOT NULL,
	`location_lon` real NOT NULL,
	`destination_name` text,
	`destination_lat` real,
	`destination_lon` real,
	`created_at` text NOT NULL,
	FOREIGN KEY (`dreamer_id`) REFERENCES `dreamers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_dreams_dreamer` ON `dreams` (`dreamer_id`);--> statement-breakpoint
CREATE INDEX `idx_dreams_location` ON `dreams` (`location_lat`,`location_lon`);--> statement-breakpoint
CREATE TABLE `help_offers` (
	`id` text PRIMARY KEY NOT NULL,
	`dream_id` text NOT NULL,
	`helper_id` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`dream_id`) REFERENCES `dreams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`helper_id`) REFERENCES `dreamers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_help_dream` ON `help_offers` (`dream_id`);--> statement-breakpoint
CREATE TABLE `votes` (
	`id` text PRIMARY KEY NOT NULL,
	`dream_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`dream_id`) REFERENCES `dreams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voter_id`) REFERENCES `dreamers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_votes_dream_voter` ON `votes` (`dream_id`,`voter_id`);