CREATE TABLE "agent_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name_i18n_key" text NOT NULL,
	"description_i18n_key" text NOT NULL,
	"suggested_name_i18n_key" text NOT NULL,
	"emoji" text NOT NULL,
	"emoji_bg_color" text NOT NULL,
	"soul" text NOT NULL,
	"identity" text NOT NULL,
	"operating_instructions" text NOT NULL
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
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"password_hash" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"k8s_namespace" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_k8s_namespace_unique" UNIQUE("k8s_namespace")
);
--> statement-breakpoint
ALTER TABLE "team_type_roles" ADD CONSTRAINT "team_type_roles_team_type_id_team_types_id_fk" FOREIGN KEY ("team_type_id") REFERENCES "public"."team_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_type_roles" ADD CONSTRAINT "team_type_roles_agent_role_id_agent_roles_id_fk" FOREIGN KEY ("agent_role_id") REFERENCES "public"."agent_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;