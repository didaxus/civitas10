"use strict";
const { sql } = require("drizzle-orm");
const { pgTable, uuid, varchar, timestamp, jsonb, index, primaryKey } = require("drizzle-orm/pg-core");

const governanceAuditEvents = pgTable("governance_audit_events", {
  eventId: uuid("event_id").primaryKey(), schemaVersion: varchar("schema_version", { length: 16 }).notNull(), eventType: varchar("event_type", { length: 160 }).notNull(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(), actorRef: varchar("actor_ref", { length: 96 }).notNull(), operation: varchar("operation", { length: 160 }).notNull(),
  target: jsonb("target").notNull(), outcome: varchar("outcome", { length: 40 }).notNull(), reasonCode: varchar("reason_code", { length: 120 }).notNull(), decisionId: varchar("decision_id", { length: 160 }),
  decisionSnapshot: jsonb("decision_snapshot"), sourceVersions: jsonb("source_versions").notNull().default(sql`'{}'::jsonb`), correlationId: varchar("correlation_id", { length: 160 }), causationId: varchar("causation_id", { length: 160 }),
  beforeRedacted: jsonb("before_redacted"), afterRedacted: jsonb("after_redacted"), sensitivity: varchar("sensitivity", { length: 40 }).notNull(), retentionClass: varchar("retention_class", { length: 40 }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ tenantCursorIdx: index("governance_audit_tenant_cursor_idx").on(table.logtoOrganizationId, table.recordedAt, table.eventId), tenantOperationIdx: index("governance_audit_tenant_operation_idx").on(table.logtoOrganizationId, table.operation, table.recordedAt) }));

const governanceAuditRetentionTombstones = pgTable("governance_audit_retention_tombstones", {
  eventId: uuid("event_id").notNull(), logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(), expiredAt: timestamp("expired_at", { withTimezone: true }).notNull().defaultNow(), retentionClass: varchar("retention_class", { length: 40 }).notNull(),
}, (table) => ({ pk: primaryKey({ columns: [table.logtoOrganizationId, table.eventId] }) }));
module.exports = { governanceAuditEvents, governanceAuditRetentionTombstones };
