ALTER TABLE "agents" ADD COLUMN "long_term_memory" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "short_term_journal" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "llm_provider" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "llm_model" text;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "llm_api_key" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_name" text;