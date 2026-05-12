CREATE TYPE "public"."actor_type" AS ENUM('human', 'agent');--> statement-breakpoint
CREATE TYPE "public"."agent_availability" AS ENUM('available', 'busy', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."agent_k8s_status" AS ENUM('pending', 'provisioning', 'running', 'failed', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."capability_type" AS ENUM('task_template', 'workflow');--> statement-breakpoint
CREATE TYPE "public"."change_type" AS ENUM('data', 'status', 'relationship', 'creation', 'deletion');--> statement-breakpoint
CREATE TYPE "public"."counterpart_type" AS ENUM('human', 'agent', 'external');--> statement-breakpoint
CREATE TYPE "public"."integration_provider" AS ENUM('linear', 'jira', 'trello', 'github');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('info', 'normal', 'high', 'alert');--> statement-breakpoint
CREATE TYPE "public"."request_resolution" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('draft', 'open', 'in_progress', 'waiting_user', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_resolution" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'waiting_user', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"request_id" uuid,
	"task_id" uuid,
	"actor_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"change_type" "change_type" NOT NULL,
	"old_state" jsonb,
	"new_state" jsonb,
	"activity_title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name_i18n_key" text NOT NULL,
	"description_i18n_key" text NOT NULL,
	"suggested_name_i18n_key" text NOT NULL,
	"emoji" text NOT NULL,
	"emoji_bg_color" text NOT NULL,
	"soul" text NOT NULL,
	"identity" text NOT NULL,
	"operating_instructions" text NOT NULL,
	"user_context" text DEFAULT '' NOT NULL,
	"memory" text DEFAULT '' NOT NULL,
	"tools_notes" text DEFAULT '' NOT NULL,
	"heartbeat" text DEFAULT '' NOT NULL,
	"agents_base" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role_id" text,
	"icon" text,
	"bg_color" text,
	"metadata" jsonb,
	"gateway_token" text,
	"k8s_status" "agent_k8s_status" DEFAULT 'pending',
	"k8s_resource_name" text,
	"availability" "agent_availability" DEFAULT 'available' NOT NULL,
	"is_leader" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"task_id" uuid,
	"request_id" uuid,
	"actor_id" uuid NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"counterpart_type" "counterpart_type" NOT NULL,
	"counterpart_id" text,
	"counterpart_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"provider" "integration_provider" NOT NULL,
	"api_key" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"token_count" integer,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"recipient_type" "actor_type" NOT NULL,
	"title" text NOT NULL,
	"content" text,
	"priority" "notification_priority" DEFAULT 'normal' NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"related_entity_id" uuid,
	"related_entity_type" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"identifier" text NOT NULL,
	"requester_user_id" uuid,
	"requester_agent_id" uuid,
	"parent_request_id" uuid,
	"title" text DEFAULT 'New Request' NOT NULL,
	"request_details" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"target_role" text,
	"target_agent_id" uuid,
	"capabilities_workflow" jsonb,
	"state" jsonb,
	"status" "request_status" DEFAULT 'open' NOT NULL,
	"resolution" "request_resolution",
	"response" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "requests_team_id_number_unique" UNIQUE("team_id","number"),
	CONSTRAINT "requests_team_id_identifier_unique" UNIQUE("team_id","identifier")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"request_id" uuid,
	"title" text NOT NULL,
	"prompt" text,
	"instructions" text,
	"plan" text,
	"task_list" text,
	"work_summary" text,
	"result" text,
	"assigned_to_id" uuid,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"resolution" "task_resolution",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description_i18n_key" text,
	"identifier" text NOT NULL,
	"instructions" text NOT NULL,
	"inputs_description" text,
	"expected_outputs_description" text,
	"tasks_workflow" jsonb,
	"type" "capability_type" DEFAULT 'task_template' NOT NULL,
	"is_candidate" boolean DEFAULT false NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"schedule_config" jsonb,
	"assigned_agent_id" uuid,
	"assigned_role" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_capabilities_team_id_identifier_unique" UNIQUE("team_id","identifier")
);
--> statement-breakpoint
CREATE TABLE "team_type_roles" (
	"team_type_id" text NOT NULL,
	"agent_role_id" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"is_leader" boolean DEFAULT false NOT NULL,
	CONSTRAINT "team_type_roles_team_type_id_agent_role_id_pk" PRIMARY KEY("team_type_id","agent_role_id")
);
--> statement-breakpoint
CREATE TABLE "team_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name_i18n_key" text NOT NULL,
	"description_i18n_key" text NOT NULL,
	"emoji" text NOT NULL,
	"color" text NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"mission" text NOT NULL,
	"ways_of_working" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"identifier_prefix" text NOT NULL,
	"icon" text,
	"mission" text,
	"ways_of_working" text,
	"template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_workspace_id_identifier_prefix_unique" UNIQUE("workspace_id","identifier_prefix")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"k8s_namespace" text
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_role_id_agent_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."agent_roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_requester_agent_id_agents_id_fk" FOREIGN KEY ("requester_agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_parent_request_id_requests_id_fk" FOREIGN KEY ("parent_request_id") REFERENCES "public"."requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_target_agent_id_agents_id_fk" FOREIGN KEY ("target_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_capabilities" ADD CONSTRAINT "team_capabilities_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_capabilities" ADD CONSTRAINT "team_capabilities_assigned_agent_id_agents_id_fk" FOREIGN KEY ("assigned_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_type_roles" ADD CONSTRAINT "team_type_roles_team_type_id_team_types_id_fk" FOREIGN KEY ("team_type_id") REFERENCES "public"."team_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_type_roles" ADD CONSTRAINT "team_type_roles_agent_role_id_agent_roles_id_fk" FOREIGN KEY ("agent_role_id") REFERENCES "public"."agent_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_template_id_team_types_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."team_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;