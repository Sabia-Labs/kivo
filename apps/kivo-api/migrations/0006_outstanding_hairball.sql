ALTER TABLE "agent_roles" ADD COLUMN "competence" text NOT NULL;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "competence" text;--> statement-breakpoint
ALTER TABLE "agent_roles" DROP COLUMN "soul";--> statement-breakpoint
ALTER TABLE "agent_roles" DROP COLUMN "operating_instructions";--> statement-breakpoint
ALTER TABLE "agent_roles" DROP COLUMN "user_context";--> statement-breakpoint
ALTER TABLE "agent_roles" DROP COLUMN "memory";--> statement-breakpoint
ALTER TABLE "agent_roles" DROP COLUMN "tools_notes";--> statement-breakpoint
ALTER TABLE "agent_roles" DROP COLUMN "heartbeat";--> statement-breakpoint
ALTER TABLE "agent_roles" DROP COLUMN "agents_base";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "soul";