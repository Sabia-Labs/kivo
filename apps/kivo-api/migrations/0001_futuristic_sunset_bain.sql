CREATE TABLE "leader_chat_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"message" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "soul" text;--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "identity" text;--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "agents_instructions" text;--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "user_context" text;--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "memory" text;--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "daily_logs" jsonb;--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "tools_notes" text;--> statement-breakpoint
ALTER TABLE "agent_roles" ADD COLUMN "heartbeat" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "soul" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "identity" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "agents_instructions" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "user_context" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "memory" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "daily_logs" jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "tools_notes" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "heartbeat" text;--> statement-breakpoint
ALTER TABLE "leader_chat_history" ADD CONSTRAINT "leader_chat_history_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;