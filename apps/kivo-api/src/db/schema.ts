import { pgTable, uuid, text, timestamp, pgEnum, jsonb, integer, boolean, unique, primaryKey, type AnyPgColumn } from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const agentAvailabilityEnum = pgEnum("agent_availability", [
  "available",
  "busy",
  "blocked"
]);

export const integrationProviderEnum = pgEnum("integration_provider", [
  "linear",
  "jira",
  "trello",
  "github",
  "notion",
]);

export const counterpartTypeEnum = pgEnum("counterpart_type", [
  "human",
  "agent",
  "external",
]);

export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);

export const actorTypeEnum = pgEnum("actor_type", ["human", "agent"]);

export const requestStatusEnum = pgEnum("request_status", [
  "draft", 
  "open", 
  "in_progress", 
  "waiting_user", 
  "success", 
  "failed"
]);

export const taskStatusEnum = pgEnum("task_status", [
  "open", 
  "in_progress", 
  "success", 
  "failed"
]);

export const changeTypeEnum = pgEnum("change_type", ["data", "status", "relationship", "creation", "deletion"]);

export const notificationPriorityEnum = pgEnum("notification_priority", ["info", "normal", "high", "alert"]);

export const capabilityTypeEnum = pgEnum("capability_type", [
  "task_template", 
  "workflow",
  "human_approval",
  "foreach"
]);

export const workspaceTierEnum = pgEnum("workspace_tier", ["free", "basic", "pro"]);

export const llmProviderEnum = pgEnum("llm_provider", [
  "openai",
  "gemini",
  "anthropic",
  "deepseek"
]);


// ── Reference Tables (Replica from Admin API) ────────────────────────────────

export const agentRoles = pgTable("agent_roles", {
  id: text("id").primaryKey(),
  nameI18nKey: text("name_i18n_key").notNull(),
  descriptionI18nKey: text("description_i18n_key").notNull(),
  suggestedNameI18nKey: text("suggested_name_i18n_key").notNull(),
  emoji: text("emoji").notNull(),
  emojiBgColor: text("emoji_bg_color").notNull(),
  identity: text("identity").notNull(),
  competence: text("competence").notNull(),
});

export const teamTypes = pgTable("team_types", {
  id: text("id").primaryKey(),
  nameI18nKey: text("name_i18n_key").notNull(),
  descriptionI18nKey: text("description_i18n_key").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  featured: boolean("featured").notNull().default(false),
  mission: text("mission").notNull(),
  waysOfWorking: text("ways_of_working").notNull(),
  externalTools: jsonb("external_tools").default([]),
});

export const teamTypeRoles = pgTable("team_type_roles", {
  teamTypeId: text("team_type_id")
    .notNull()
    .references(() => teamTypes.id, { onDelete: "cascade" }),
  agentRoleId: text("agent_role_id")
    .notNull()
    .references(() => agentRoles.id, { onDelete: "cascade" }),
  quantity: integer("quantity").notNull().default(1),
  isLeader: boolean("is_leader").notNull().default(false),
}, (t) => ({
  pk: primaryKey({ columns: [t.teamTypeId, t.agentRoleId] }),
}));

export const capabilities = pgTable("capabilities", {
  id: text("id").primaryKey(), // e.g., 'triage-open-tickets'
  name: text("name").notNull(),
  type: capabilityTypeEnum("type").notNull(),
  instructions: text("instructions").notNull(),
  inputsDescription: text("inputs_description"),
  expectedOutputsDescription: text("expected_outputs_description"),
  tasksWorkflow: jsonb("tasks_workflow"), // Array of strings (capability IDs)
  loopOver: text("loop_over"),
  loopItem: text("loop_item"),
  runWorkflow: text("run_workflow"),
});

export const teamTypeCapabilities = pgTable("team_type_capabilities", {
  teamTypeId: text("team_type_id")
    .notNull()
    .references(() => teamTypes.id, { onDelete: "cascade" }),
  capabilityId: text("capability_id")
    .notNull()
    .references(() => capabilities.id, { onDelete: "cascade" }),
  isFavorite: boolean("is_favorite").notNull().default(false),
  defaultAssignedRole: text("default_assigned_role").references(() => agentRoles.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.teamTypeId, t.capabilityId] }),
}));

// ── Operational Tables ───────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  preferredName: text("preferred_name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  k8sNamespace: text("k8s_namespace"),
  tier: workspaceTierEnum("tier").notNull().default("free"),
  teamLimit: integer("team_limit"),
  agentsPerTeamLimit: integer("agents_per_team_limit"),
  monthlyAutomationLimit: integer("monthly_automation_limit"),
  langchain: boolean("langchain").notNull().default(false),
  language: text("language").notNull().default("en"),
});

export const verificationCodes = pgTable("verification_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  identifierPrefix: text("identifier_prefix").notNull(),
  icon: text("icon"),
  mission: text("mission"),
  waysOfWorking: text("ways_of_working"),
  longTermMemory: text("long_term_memory"),
  /** Refers to teamTypes.id template */
  templateId: text("template_id").references(() => teamTypes.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq_team_prefix_workspace: unique().on(t.workspaceId, t.identifierPrefix),
}));

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Refers to agentRoles.id */
  roleId: text("role_id").references(() => agentRoles.id),
  /** The agent's emoji icon */
  icon: text("icon"),
  /** The agent's custom background color */
  bgColor: text("bg_color"),
  metadata: jsonb("metadata"),
  availability: agentAvailabilityEnum("availability").notNull().default("available"),
  isLeader: boolean("is_leader").notNull().default(false),
  longTermMemory: text("long_term_memory"),
  shortTermJournal: text("short_term_journal"),
  llmProvider: text("llm_provider"),
  llmModel: text("llm_model"),
  llmApiKey: text("llm_api_key"),
  identity: text("identity"),
  competence: text("competence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  provider: integrationProviderEnum("provider").notNull(),
  apiKey: text("api_key"),
  metadata: jsonb("metadata"),
  role: text("role"),
  instructions: text("instructions"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").references((): AnyPgColumn => requests.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  changeType: changeTypeEnum("change_type").notNull(),
  oldState: jsonb("old_state"),
  newState: jsonb("new_state"),
  activityTitle: text("activity_title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  counterpartType: counterpartTypeEnum("counterpart_type").notNull(),
  counterpartId: text("counterpart_id"),
  counterpartName: text("counterpart_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  tokenCount: integer("token_count"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  recipientId: uuid("recipient_id").notNull(),
  recipientType: actorTypeEnum("recipient_type").notNull(),
  title: text("title").notNull(),
  content: text("content"),
  priority: notificationPriorityEnum("priority").notNull().default("normal"),
  isRead: boolean("is_read").notNull().default(false),
  relatedEntityId: uuid("related_entity_id"),
  relatedEntityType: text("related_entity_type"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").references((): AnyPgColumn => requests.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  prompt: text("prompt"),
  instructions: text("instructions"),
  plan: text("plan"),
  taskList: text("task_list"),
  workSummary: text("work_summary"),
  result: text("result"),
  structuredState: jsonb("structured_state"),
  failureReason: text("failure_reason"),
  assignedToId: uuid("assigned_to_id"),
  status: taskStatusEnum("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable("requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  identifier: text("identifier").notNull(),
  requesterUserId: uuid("requester_user_id").references(() => users.id, { onDelete: "cascade" }),
  requesterAgentId: uuid("requester_agent_id").references(() => agents.id, { onDelete: "cascade" }),
  parentRequestId: uuid("parent_request_id").references((): AnyPgColumn => requests.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("New Request"),
  requestDetails: text("request_details"),
  priority: integer("priority").notNull().default(0),
  targetRole: text("target_role"),
  targetAgentId: uuid("target_agent_id").references(() => agents.id, { onDelete: "set null" }),
  capabilitiesWorkflow: jsonb("capabilities_workflow"),
  state: jsonb("state").$type<string[]>(),
  status: requestStatusEnum("status").notNull().default("open"),
  response: text("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  unq_team_request_number: unique().on(t.teamId, t.number),
  unq_team_request_identifier: unique().on(t.teamId, t.identifier),
}));

export const comments = pgTable("comments", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  taskId: uuid("task_id").references((): AnyPgColumn => tasks.id, { onDelete: "cascade" }),
  requestId: uuid("request_id").references((): AnyPgColumn => requests.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id").notNull(),
  actorType: actorTypeEnum("actor_type").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const teamCapabilities = pgTable("team_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  identifier: text("identifier").notNull(),
  instructions: text("instructions").notNull(),
  inputsDescription: text("inputs_description"),
  expectedOutputsDescription: text("expected_outputs_description"),
  tasksWorkflow: jsonb("tasks_workflow"),
  type: capabilityTypeEnum("type").notNull().default("task_template"),
  isCandidate: boolean("is_candidate").notNull().default(false),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isFavorite: boolean("is_favorite").notNull().default(false),
  scheduleConfig: jsonb("schedule_config"),
  assignedAgentId: uuid("assigned_agent_id").references(() => agents.id, { onDelete: "set null" }),
  assignedRole: text("assigned_role"),
  /** foreach: the state key whose value is the array to iterate over (e.g. "pendingTickets") */
  loopOver: text("loop_over"),
  /** foreach: the state key name to bind each item to (e.g. "ticketId") */
  loopItem: text("loop_item"),
  /** foreach: the capability identifier of the sub-workflow to run per item */
  runWorkflow: text("run_workflow"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq_team_capability_identifier: unique().on(t.teamId, t.identifier),
}));

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;
export type TeamCapability = typeof teamCapabilities.$inferSelect;
export type NewTeamCapability = typeof teamCapabilities.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type TeamType = typeof teamTypes.$inferSelect;
export type AgentRole = typeof agentRoles.$inferSelect;
export type TeamTypeRole = typeof teamTypeRoles.$inferSelect;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;
export type Capability = typeof capabilities.$inferSelect;
export type TeamTypeCapability = typeof teamTypeCapabilities.$inferSelect;
export type VerificationCode = typeof verificationCodes.$inferSelect;
export type NewVerificationCode = typeof verificationCodes.$inferInsert;

export const workspaceLlmKeys = pgTable("workspace_llm_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: llmProviderEnum("provider").notNull(),
  apiKey: text("api_key").notNull(),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq_workspace_provider: unique().on(t.workspaceId, t.provider),
}));



export type WorkspaceLlmKey = typeof workspaceLlmKeys.$inferSelect;
export type NewWorkspaceLlmKey = typeof workspaceLlmKeys.$inferInsert;

