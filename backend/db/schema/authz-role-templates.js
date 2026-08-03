"use strict";
const { sql } = require("drizzle-orm");
const { pgTable, uuid, varchar, text, boolean, timestamp, bigint, jsonb, uniqueIndex, index } = require("drizzle-orm/pg-core");

const roleTemplateTimestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/**
 * Role Template Versions
 * Stores versioned definitions of canonical role templates.
 * Each change creates a new version, enabling audit and rollback.
 */
const roleTemplateVersions = pgTable("role_template_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  roleKey: varchar("role_key", { length: 128 }).notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  roleModelVersion: varchar("role_model_version", { length: 128 }).notNull(),
  displayName: varchar("display_name", { length: 256 }).notNull(),
  description: text("description"),
  permissionKeys: jsonb("permission_keys").notNull().$type/** @type {string[]} */([]),
  expectedPermissionCount: bigint("expected_permission_count", { mode: "number" }),
  bundles: jsonb("bundles").notNull().$type/** @type {string[]} */([]),
  isActive: boolean("is_active").notNull().default(true),
  setByLogtoUserId: varchar("set_by_logto_user_id", { length: 128 }).notNull(),
  reason: text("reason").notNull(),
  ...roleTemplateTimestamps,
}, (table) => ({
  uniqueRoleVersion: uniqueIndex("role_template_versions_role_version_uidx").on(table.roleKey, table.version),
  roleKeyIdx: index("role_template_versions_role_key_idx").on(table.roleKey),
  versionIdx: index("role_template_versions_version_idx").on(table.version),
  isActiveIdx: index("role_template_versions_is_active_idx").on(table.isActive),
  roleModelVersionIdx: index("role_template_versions_role_model_version_idx").on(table.roleModelVersion),
}));

/**
 * Role Template Current State
 * Tracks the current active version for each role key.
 */
const roleTemplateCurrent = pgTable("role_template_current", {
  roleKey: varchar("role_key", { length: 128 }).primaryKey(),
  currentVersionId: uuid("current_version_id").notNull().references(() => roleTemplateVersions.id, { onDelete: "restrict" }),
  currentVersion: bigint("current_version", { mode: "number" }).notNull(),
  roleModelVersion: varchar("role_model_version", { length: 128 }).notNull(),
  permissionCount: bigint("permission_count", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  updatedByLogtoUserId: varchar("updated_by_logto_user_id", { length: 128 }).notNull(),
}, (table) => ({
  currentVersionIdx: index("role_template_current_version_idx").on(table.currentVersion),
  roleModelVersionIdx: index("role_template_current_role_model_version_idx").on(table.roleModelVersion),
}));

/**
 * Role Template Audit Log
 * Records all changes to role templates for compliance and traceability.
 */
const roleTemplateAuditLog = pgTable("role_template_audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  action: varchar("action", { length: 64 }).notNull(),
  roleKey: varchar("role_key", { length: 128 }).notNull(),
  version: bigint("version", { mode: "number" }).notNull(),
  actorLogtoUserId: varchar("actor_logto_user_id", { length: 128 }).notNull(),
  reason: text("reason").notNull(),
  beforeState: jsonb("before_state"),
  afterState: jsonb("after_state"),
  logtoSyncPlanId: uuid("logto_sync_plan_id"),
  logtoSyncAppliedAt: timestamp("logto_sync_applied_at", { withTimezone: true }),
  policyVersion: bigint("policy_version", { mode: "number" }),
  ...roleTemplateTimestamps,
}, (table) => ({
  roleKeyIdx: index("role_template_audit_log_role_key_idx").on(table.roleKey),
  versionIdx: index("role_template_audit_log_version_idx").on(table.version),
  actionIdx: index("role_template_audit_log_action_idx").on(table.action),
  actorIdx: index("role_template_audit_log_actor_idx").on(table.actorLogtoUserId),
  createdAtIdx: index("role_template_audit_log_created_at_idx").on(table.createdAt),
}));

module.exports = { roleTemplateVersions, roleTemplateCurrent, roleTemplateAuditLog };
