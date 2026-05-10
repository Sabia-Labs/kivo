import { pgTable, uuid, text, timestamp, boolean, integer, primaryKey } from "drizzle-orm/pg-core";

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Workspaces ────────────────────────────────────────────────────────────────
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  k8sNamespace: text("k8s_namespace").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Verification Codes ────────────────────────────────────────────────────────
export const verificationCodes = pgTable("verification_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Agent Roles (Reference) ──────────────────────────────────────────────────
export const agentRoles = pgTable("agent_roles", {
  id: text("id").primaryKey(), // e.g., 'product-manager'
  nameI18nKey: text("name_i18n_key").notNull(),
  descriptionI18nKey: text("description_i18n_key").notNull(),
  suggestedNameI18nKey: text("suggested_name_i18n_key").notNull(),
  emoji: text("emoji").notNull(),
  emojiBgColor: text("emoji_bg_color").notNull(),
  soul: text("soul").notNull(),
  identity: text("identity").notNull(),
  operatingInstructions: text("operating_instructions").notNull(),
});

// ── Team Types (Reference) ───────────────────────────────────────────────────
export const teamTypes = pgTable("team_types", {
  id: text("id").primaryKey(), // e.g., 'product-delivery'
  nameI18nKey: text("name_i18n_key").notNull(),
  descriptionI18nKey: text("description_i18n_key").notNull(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  featured: boolean("featured").notNull().default(false),
  mission: text("mission").notNull(),
  waysOfWorking: text("ways_of_working").notNull(),
});

// ── Team Type Roles (N:N Composition) ────────────────────────────────────────
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
