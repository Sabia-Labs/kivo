import { pgTable, uuid, text, timestamp, pgEnum, jsonb, integer, boolean, unique, primaryKey, type AnyPgColumn } from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const agentTypeEnum = pgEnum("agent_type", [
  "team_lead",
  "software_engineer",
  "product_manager",
  "software_architect",
]);

/**
 * Tracks the Kubernetes provisioning state of an agent workload.
 * Updated by the Agent Controller via PATCH /internal/agents/:id/k8s-status.
 */
export const agentK8sStatusEnum = pgEnum("agent_k8s_status", [
  "pending",       // CR not yet applied to cluster
  "provisioning", // CR applied, controller reconciling
  "running",      // Deployment Available
  "failed",       // Reconciliation error
  "terminated",   // CR deleted, resources being GC'd
]);

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
  "completed", 
  "cancelled"
]);

export const requestResolutionEnum = pgEnum("request_resolution", ["success", "failed"]);

export const taskStatusEnum = pgEnum("task_status", [
  "open", 
  "in_progress", 
  "waiting_user", 
  "completed", 
  "cancelled"
]);

export const taskResolutionEnum = pgEnum("task_resolution", ["success", "failed"]);

export const changeTypeEnum = pgEnum("change_type", ["data", "status", "relationship", "creation", "deletion"]);

export const notificationPriorityEnum = pgEnum("notification_priority", ["info", "normal", "high", "alert"]);

export const capabilityTypeEnum = pgEnum("capability_type", [
  "task_template", 
  "workflow"
]);


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

export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;

// ── Users (Logical Reference) ──────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;

// ── Workspaces (Logical Reference) ──────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  k8sNamespace: text("k8s_namespace"),
});

export type Workspace = typeof workspaces.$inferSelect;

// ── Teams ─────────────────────────────────────────────────────────────────────

export const teams = pgTable("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Logical reference to workspace in Admin API database */
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  identifierPrefix: text("identifier_prefix").notNull(),
  icon: text("icon"),
  mission: text("mission"),
  waysOfWorking: text("ways_of_working"),
  /** Template vertical: starter | engineering | customer_support */
  template: text("template").notNull().default("starter"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq_team_prefix_workspace: unique().on(t.workspaceId, t.identifierPrefix),
}));

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;

export const agents = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  icon: text("icon"),
  /** JSON bag for avatarColor, telegramBotToken, telegramPairingCode, etc. */
  metadata: jsonb("metadata"),
  /**
   * Openclaw gateway authentication token.
   * Generated once on agent creation (crypto.randomBytes(32).toString('base64url')).
   * Passed to the pod as OPENCLAW_GATEWAY_TOKEN via the credentials Secret.
   * Never regenerated — same token persists across pod restarts (PVC state).
   */
  gatewayToken: text("gateway_token"),
  /** Current Kubernetes provisioning phase, updated by the Agent Controller. */
  k8sStatus: agentK8sStatusEnum("k8s_status").default("pending"),
  /** Name of the KivoAgent CR in the cluster (equals agent UUID). */
  k8sResourceName: text("k8s_resource_name"),
  /** Current availability of the agent. */
  availability: agentAvailabilityEnum("availability").notNull().default("available"),
  /** Defining personality, values, tone, and behavioral boundaries */
  soul: text("soul"),
  /** Surface-level details like name, ID, role label, and voice */
  identity: text("identity"),
  /** Operational instructions and rules governing agent behavior */
  agentsInstructions: text("agents_instructions"),
  /** Preferences, communication style, and context about the human user */
  userContext: text("user_context"),
  /** Long-term memory storing durable facts, preferences, and decisions */
  memory: text("memory"),
  /** JSON map of dates to daily log strings for running context */
  dailyLogs: jsonb("daily_logs"),
  /** Notes about external tools and conventions */
  toolsNotes: text("tools_notes"),
  /** Used for scheduled tasks and to trigger periodic actions */
  heartbeat: text("heartbeat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

// ── Integrations ──────────────────────────────────────────────────────────────

export const integrations = pgTable("integrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  provider: integrationProviderEnum("provider").notNull(),
  apiKey: text("api_key"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;

// ── Conversations ─────────────────────────────────────────────────────────────

/**
 * A conversation thread between an agent and a counterpart
 * (human user, another agent, or an external system).
 */
export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: uuid("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  counterpartType: counterpartTypeEnum("counterpart_type").notNull(),
  /** FK to users, agents, or free-form string for external systems */
  counterpartId: text("counterpart_id"),
  counterpartName: text("counterpart_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

// ── Messages ──────────────────────────────────────────────────────────────────

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: messageRoleEnum("role").notNull(),
  content: text("content").notNull(),
  /** Token usage for this message (informational) */
  tokenCount: integer("token_count"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

// ── Notifications ──────────────────────────────────────────────────────────────

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

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// ── Task Management (Kanban) ────────────────────────────────────────────────

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
  assignedToId: uuid("assigned_to_id"),
  status: taskStatusEnum("status").notNull().default("open"),
  resolution: taskResolutionEnum("resolution"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;




// ── Requests (Agent-to-Agent / Human-to-Agent) ─────────────────────────

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
  resolution: requestResolutionEnum("resolution"),
  response: text("response"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  unq_team_request_number: unique().on(t.teamId, t.number),
  unq_team_request_identifier: unique().on(t.teamId, t.identifier),
}));

export type Request = typeof requests.$inferSelect;
export type NewRequest = typeof requests.$inferInsert;

// ── Comments ────────────────────────────────────────────────────────────────

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

export type Comment = typeof comments.$inferSelect;
export type NewComment = typeof comments.$inferInsert;

// ── Meta Configuration (Templates & Roles) ──────────────────────────────────

export const teamTypes = pgTable("team_types", {
  id: text("id").primaryKey(), // Using text IDs like 'engineering', 'sales'
  name: text("name").notNull(),
  description: text("description"),
  featured: boolean("featured").notNull().default(false),
  mission: text("mission"),
  waysOfWorking: text("ways_of_working"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamType = typeof teamTypes.$inferSelect;

export const teamMetaCapabilities = pgTable("team_meta_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamTypeId: text("team_type_id")
    .notNull()
    .references(() => teamTypes.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  identifier: text("identifier").notNull(),
  instructions: text("instructions").notNull(),
  inputsDescription: text("inputs_description"),
  expectedOutputsDescription: text("expected_outputs_description"),
  tasksWorkflow: jsonb("tasks_workflow"), // Array of string identifiers
  type: capabilityTypeEnum("type").notNull().default("task_template"),
  isCandidate: boolean("is_candidate").notNull().default(false),
  isFavorite: boolean("is_favorite").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeamMetaCapability = typeof teamMetaCapabilities.$inferSelect;
export type NewTeamMetaCapability = typeof teamMetaCapabilities.$inferInsert;

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  unq_team_capability_identifier: unique().on(t.teamId, t.identifier),
}));

export type TeamCapability = typeof teamCapabilities.$inferSelect;
export type NewTeamCapability = typeof teamCapabilities.$inferInsert;


export const agentRoles = pgTable("agent_roles", {
  id: text("id").primaryKey(), // Using text IDs like 'software_engineer'
  name: text("name").notNull(),
  description: text("description"),
  emoji: text("emoji").notNull(),
  backgroundColor: text("background_color").notNull(), // Hex or CSS color
  suggestedName: text("suggested_name").notNull().default("agent_default_name"), // Dictionary key
  /** Defining personality, values, tone, and behavioral boundaries */
  soul: text("soul"),
  /** Surface-level details like name, ID, role label, and voice */
  identity: text("identity"),
  /** Operational instructions and rules governing agent behavior */
  agentsInstructions: text("agents_instructions"),
  /** Preferences, communication style, and context about the human user */
  userContext: text("user_context"),
  /** Long-term memory storing durable facts, preferences, and decisions */
  memory: text("memory"),
  /** JSON map of dates to daily log strings for running context */
  dailyLogs: jsonb("daily_logs"),
  /** Notes about external tools and conventions */
  toolsNotes: text("tools_notes"),
  /** Used for scheduled tasks and to trigger periodic actions */
  heartbeat: text("heartbeat"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AgentRole = typeof agentRoles.$inferSelect;

export const teamTypeRoles = pgTable("team_type_roles", {
  teamTypeId: text("team_type_id")
    .notNull()
    .references(() => teamTypes.id, { onDelete: "cascade" }),
  agentRoleId: text("agent_role_id")
    .notNull()
    .references(() => agentRoles.id, { onDelete: "cascade" }),
  isLeader: boolean("is_leader").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.teamTypeId, t.agentRoleId] }),
}));

export const leaderChatHistory = pgTable("leader_chat_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  teamId: uuid("team_id")
    .notNull()
    .references(() => teams.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  message: text("message").notNull(),
  role: text("role").notNull(), // 'user' | 'assistant'
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LeaderChatHistory = typeof leaderChatHistory.$inferSelect;
export type NewLeaderChatHistory = typeof leaderChatHistory.$inferInsert;

export type TeamTypeRole = typeof teamTypeRoles.$inferSelect;
