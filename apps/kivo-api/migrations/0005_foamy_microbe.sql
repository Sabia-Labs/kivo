ALTER TABLE "agents" DROP COLUMN "gateway_token";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "k8s_status";--> statement-breakpoint
ALTER TABLE "agents" DROP COLUMN "k8s_resource_name";--> statement-breakpoint
DROP TYPE "public"."agent_k8s_status";