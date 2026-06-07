ALTER TYPE "public"."capability_type" ADD VALUE 'foreach';--> statement-breakpoint
ALTER TABLE "team_capabilities" ADD COLUMN "loop_over" text;--> statement-breakpoint
ALTER TABLE "team_capabilities" ADD COLUMN "loop_item" text;--> statement-breakpoint
ALTER TABLE "team_capabilities" ADD COLUMN "run_workflow" text;