CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`record_id` text,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_round` ON `audit_events` (`round_id`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`record_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `survey_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `evidence_round` ON `evidence` (`round_id`);--> statement-breakpoint
CREATE TABLE `observations` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text NOT NULL,
	`record_id` text NOT NULL,
	`payload` text NOT NULL,
	`version` integer NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `survey_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `observation_round_record` ON `observations` (`round_id`,`record_id`);--> statement-breakpoint
CREATE TABLE `operation_receipts` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`request_hash` text NOT NULL,
	`response` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `report_snapshots` (
	`round_id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`source_hash` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `survey_rounds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `survey_rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`plot_ids` text NOT NULL,
	`notes` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`locked_at` text,
	`created_by` text NOT NULL
);
