ALTER TABLE "vouchers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "vouchers" CASCADE;--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "tier" SET DEFAULT 'free';--> statement-breakpoint
ALTER TABLE "workspaces" ALTER COLUMN "tier" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "team_limit" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "agents_per_team_limit" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "monthly_automation_limit" integer;--> statement-breakpoint
ALTER TABLE "public"."workspaces" ALTER COLUMN "tier" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."workspace_tier" CASCADE;--> statement-breakpoint
CREATE TYPE "public"."workspace_tier" AS ENUM('free', 'basic', 'pro');--> statement-breakpoint
ALTER TABLE "public"."workspaces" ALTER COLUMN "tier" SET DATA TYPE "public"."workspace_tier" USING "tier"::"public"."workspace_tier";--> statement-breakpoint
DROP TYPE "public"."voucher_status";