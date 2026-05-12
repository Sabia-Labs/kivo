DROP TABLE "leader_chat_history" CASCADE;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "delivered_at" timestamp with time zone;