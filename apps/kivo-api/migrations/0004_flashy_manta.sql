ALTER TABLE "integrations" ADD COLUMN "role" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "team_types" ADD COLUMN "external_tools" jsonb DEFAULT '[]'::jsonb;