CREATE TYPE "public"."capability_nature" AS ENUM('inquiry', 'analysis', 'execution', 'project');--> statement-breakpoint
CREATE TYPE "public"."task_resolution" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'waiting_user', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "team_events" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "team_events" CASCADE;--> statement-breakpoint
ALTER TABLE "requests" DROP CONSTRAINT "requests_assigned_agent_id_agents_id_fk";
--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "capabilities_workflow" jsonb;--> statement-breakpoint
ALTER TABLE "requests" ADD COLUMN "state" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "prompt" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "status" "task_status" DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "resolution" "task_resolution";--> statement-breakpoint
ALTER TABLE "team_capabilities" ADD COLUMN "nature" "capability_nature";--> statement-breakpoint
ALTER TABLE "team_capabilities" ADD COLUMN "is_candidate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "team_meta_capabilities" ADD COLUMN "nature" "capability_nature";--> statement-breakpoint
ALTER TABLE "team_meta_capabilities" ADD COLUMN "is_candidate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN "instructions";--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN "assigned_agent_id";--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN "response_contract";--> statement-breakpoint
ALTER TABLE "requests" DROP COLUMN "request_capabilities";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "execution_log";--> statement-breakpoint
ALTER TABLE "team_capabilities" DROP COLUMN "triggers";--> statement-breakpoint
ALTER TABLE "team_capabilities" DROP COLUMN "expected_events_output";--> statement-breakpoint
ALTER TABLE "team_meta_capabilities" DROP COLUMN "triggers";--> statement-breakpoint
ALTER TABLE "team_meta_capabilities" DROP COLUMN "expected_events_output";