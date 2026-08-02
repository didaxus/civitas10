"use strict";
const { sql } = require("drizzle-orm");
const { pgTable, varchar, integer, timestamp, jsonb, primaryKey, foreignKey, uniqueIndex, index } = require("drizzle-orm/pg-core");

const planningProfiles = pgTable("planning_profiles", {
  organizationId: varchar("organization_id", { length: 128 }).notNull(),
  id: varchar("id", { length: 180 }).notNull(),
  version: integer("version").notNull().default(1),
  configuration: jsonb("configuration").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }), organizationVersion: uniqueIndex("planning_profiles_org_id_version_uidx").on(t.organizationId, t.id, t.version) }));

const planningPlans = pgTable("planning_plans", {
  organizationId: varchar("organization_id", { length: 128 }).notNull(),
  id: varchar("id", { length: 180 }).notNull(),
  profileId: varchar("profile_id", { length: 180 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  planType: varchar("plan_type", { length: 32 }).notNull().default("operational"),
  state: varchar("state", { length: 32 }).notNull().default("draft"),
  currentVersion: integer("current_version").notNull().default(1),
  revision: integer("revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }), profileFk: foreignKey({ columns: [t.organizationId, t.profileId], foreignColumns: [planningProfiles.organizationId, planningProfiles.id] }), orgStateIdx: index("planning_plans_org_state_idx").on(t.organizationId, t.state, t.updatedAt), orgRevision: uniqueIndex("planning_plans_org_id_revision_uidx").on(t.organizationId, t.id, t.revision) }));

const planningVersions = pgTable("planning_versions", {
  organizationId: varchar("organization_id", { length: 128 }).notNull(), planId: varchar("plan_id", { length: 180 }).notNull(),
  version: integer("version").notNull(), state: varchar("state", { length: 32 }).notNull(),
  content: jsonb("content").notNull(), createdBy: varchar("created_by", { length: 180 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  approvedBy: varchar("approved_by", { length: 180 }), approvedAt: timestamp("approved_at", { withTimezone: true }),
  sourceVersion: integer("source_version"), sourceHash: varchar("source_hash", { length: 64 }),
  sourceActor: varchar("source_actor", { length: 180 }), sourceAt: timestamp("source_at", { withTimezone: true }), sourceReason: varchar("source_reason", { length: 2000 }),
}, (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.planId, t.version] }), planFk: foreignKey({ columns: [t.organizationId, t.planId], foreignColumns: [planningPlans.organizationId, planningPlans.id] }), historyIdx: index("planning_versions_org_plan_created_idx").on(t.organizationId, t.planId, t.createdAt) }));

const planningAudit = pgTable("planning_audit", {
  organizationId: varchar("organization_id", { length: 128 }).notNull(), id: varchar("id", { length: 180 }).notNull(),
  planId: varchar("plan_id", { length: 180 }), action: varchar("action", { length: 160 }).notNull(), actorId: varchar("actor_id", { length: 180 }).notNull(),
  aggregateRevision: integer("aggregate_revision"), details: jsonb("details").notNull().default(sql`'{}'::jsonb`),
  correlationId: varchar("correlation_id", { length: 160 }).notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.id] }), planFk: foreignKey({ columns: [t.organizationId, t.planId], foreignColumns: [planningPlans.organizationId, planningPlans.id] }), planIdx: index("planning_audit_org_plan_idx").on(t.organizationId, t.planId, t.createdAt) }));

const planningIdempotency = pgTable("planning_idempotency", {
  organizationId: varchar("organization_id", { length: 128 }).notNull(), key: varchar("idempotency_key", { length: 200 }).notNull(),
  principalId: varchar("principal_id", { length: 180 }).notNull(), operationId: varchar("operation_id", { length: 180 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 128 }).notNull(), result: jsonb("result").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ pk: primaryKey({ columns: [t.organizationId, t.principalId, t.operationId, t.key] }) }));

module.exports = { planningAudit, planningIdempotency, planningPlans, planningProfiles, planningVersions };
