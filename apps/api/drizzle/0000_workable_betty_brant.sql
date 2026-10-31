CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `request_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `nonce_expiry` ON `request_nonces` (`expires_at`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`body` text NOT NULL,
	`author_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`answered` integer DEFAULT 0 NOT NULL,
	`highlighted` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "body_length" CHECK(length("questions"."body") between 1 and 1000),
	CONSTRAINT "answered_boolean" CHECK("questions"."answered" in (0,1)),
	CONSTRAINT "highlighted_boolean" CHECK("questions"."highlighted" in (0,1))
);
--> statement-breakpoint
CREATE INDEX `questions_event` ON `questions` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `votes` (
	`question_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`question_id`, `user_id`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
