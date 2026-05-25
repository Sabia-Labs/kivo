CREATE TYPE "public"."llm_provider" AS ENUM('openai', 'gemini', 'anthropic', 'deepseek');--> statement-breakpoint
CREATE TYPE "public"."voucher_status" AS ENUM('available', 'redeemed');--> statement-breakpoint
CREATE TYPE "public"."workspace_tier" AS ENUM('free_byok', 'pro');--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"status" "voucher_status" DEFAULT 'available' NOT NULL,
	"redeemed_by_workspace_id" uuid,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "workspace_llm_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "llm_provider" NOT NULL,
	"api_key" text NOT NULL,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_llm_keys_workspace_id_provider_unique" UNIQUE("workspace_id","provider")
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "tier" "workspace_tier";--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_redeemed_by_workspace_id_workspaces_id_fk" FOREIGN KEY ("redeemed_by_workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_llm_keys" ADD CONSTRAINT "workspace_llm_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;