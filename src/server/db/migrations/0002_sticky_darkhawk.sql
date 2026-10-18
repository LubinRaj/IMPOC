ALTER TABLE "sync_plans" ADD COLUMN "destination" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD COLUMN "destination" text DEFAULT 'local' NOT NULL;