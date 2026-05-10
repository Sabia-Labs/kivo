CREATE TABLE "capabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"name_i18n_key" text NOT NULL,
	"description_i18n_key" text NOT NULL,
	"type" text NOT NULL,
	"instructions" text NOT NULL,
	"inputs_description" text,
	"expected_outputs_description" text,
	"tasks_workflow" jsonb
);
--> statement-breakpoint
CREATE TABLE "team_type_capabilities" (
	"team_type_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"default_assigned_role" text,
	CONSTRAINT "team_type_capabilities_team_type_id_capability_id_pk" PRIMARY KEY("team_type_id","capability_id")
);
--> statement-breakpoint
ALTER TABLE "team_type_capabilities" ADD CONSTRAINT "team_type_capabilities_team_type_id_team_types_id_fk" FOREIGN KEY ("team_type_id") REFERENCES "public"."team_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_type_capabilities" ADD CONSTRAINT "team_type_capabilities_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_type_capabilities" ADD CONSTRAINT "team_type_capabilities_default_assigned_role_agent_roles_id_fk" FOREIGN KEY ("default_assigned_role") REFERENCES "public"."agent_roles"("id") ON DELETE no action ON UPDATE no action;