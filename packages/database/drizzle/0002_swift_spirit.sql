ALTER TABLE "properties" ADD COLUMN "supervisor_score" smallint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "supervisor_factual_score" smallint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "supervisor_content_score" smallint;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "supervisor_issues" jsonb;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "supervisor_summary" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "supervisor_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "supervisor_check_version" text;--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "qa_status" text;--> statement-breakpoint
ALTER TABLE "property_images" ADD CONSTRAINT "property_images_property_position" UNIQUE("property_id","position");