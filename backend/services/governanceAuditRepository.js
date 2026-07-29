"use strict";

const crypto = require("node:crypto");

const AUDIT_SCHEMA_VERSION = "1.0";
const DEFAULT_RETENTION_CLASS = "governance_7y";
const FORBIDDEN_KEY = /(authorization|cookie|jwt|token|secret|password|api[-_]?key|headers?|email|resource(?:id|ref)?)/i;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function digest(value) { return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 24); }
function safeActor(value) { return !value || value === "system" ? "system" : `subject_sha256:${digest(value)}`; }
function safeTarget(type, value) { return Object.freeze({ type: String(type || "governance"), opaqueId: value == null ? null : `target_sha256:${digest(value)}` }); }
function redactPayload(value, seen = new WeakSet()) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return JWT.test(value) || EMAIL.test(value) ? "[REDACTED]" : value;
  if (typeof value !== "object") return "[REDACTED]";
  if (seen.has(value)) return "[REDACTED:CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => redactPayload(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, FORBIDDEN_KEY.test(key) ? "[REDACTED]" : redactPayload(item, seen)]));
}
function encodeCursor(row) { return Buffer.from(JSON.stringify([row.recordedAt, row.eventId]), "utf8").toString("base64url"); }
function decodeCursor(cursor) {
  if (!cursor) return null;
  try { const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")); if (!Array.isArray(value) || value.length !== 2) throw new Error(); return value; }
  catch { const error = new Error("audit_cursor_invalid"); error.code = "audit_cursor_invalid"; error.status = 400; throw error; }
}
function immutable(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(immutable); Object.freeze(value); }
  return value;
}

class GovernanceAuditRepository {
  #rows = [];
  #expired = new Map();
  constructor({ clock = () => new Date(), id = () => crypto.randomUUID() } = {}) { this.clock = clock; this.id = id; }
  tenant(organizationId) {
    if (!organizationId) throw new TypeError("organizationId is required");
    return Object.freeze({
      append: (input) => this.append(organizationId, input),
      list: (query) => this.list(organizationId, query),
      detail: (eventId) => this.detail(organizationId, eventId),
      export: (input) => this.export(organizationId, input),
    });
  }
  append(organizationId, input = {}) {
    if (!input.operation) throw new TypeError("operation is required");
    const recordedAt = (input.recordedAt ? new Date(input.recordedAt) : this.clock()).toISOString();
    const event = immutable({
      eventId: input.eventId || this.id(), schemaVersion: AUDIT_SCHEMA_VERSION, eventType: input.eventType || "governance.audit.recorded.v1",
      organizationId, actor: safeActor(input.actorId), operation: String(input.operation), target: safeTarget(input.targetType, input.targetId),
      outcome: String(input.outcome || "success"), reasonCode: String(input.reasonCode || "recorded"), decisionId: input.decisionId || null,
      decisionSnapshot: redactPayload(input.decisionSnapshot || null), sourceVersions: redactPayload(input.sourceVersions || {}),
      correlationId: input.correlationId || null, causationId: input.causationId || null,
      change: { before: redactPayload(input.before), after: redactPayload(input.after) }, sensitivity: input.sensitivity || "confidential",
      retentionClass: input.retentionClass || DEFAULT_RETENTION_CLASS, recordedAt,
    });
    this.#rows.push(event);
    return event;
  }
  list(organizationId, { cursor, limit = 50, operation, outcome, from, to } = {}) {
    const boundary = decodeCursor(cursor);
    const pageSize = Math.max(1, Math.min(Number(limit) || 50, 100));
    const eligible = this.#rows.filter((row) => row.organizationId === organizationId && (!operation || row.operation === operation) && (!outcome || row.outcome === outcome) && (!from || row.recordedAt >= new Date(from).toISOString()) && (!to || row.recordedAt <= new Date(to).toISOString()))
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.eventId.localeCompare(a.eventId))
      .filter((row) => !boundary || row.recordedAt < boundary[0] || (row.recordedAt === boundary[0] && row.eventId < boundary[1]));
    const events = eligible.slice(0, pageSize);
    return immutable({ events: events.map((event) => immutable({ ...event })), nextCursor: eligible.length > pageSize ? encodeCursor(events.at(-1)) : null });
  }
  detail(organizationId, eventId) {
    const event = this.#rows.find((row) => row.organizationId === organizationId && row.eventId === eventId);
    if (event) return immutable({ status: "available", event: immutable({ ...event }) });
    if (this.#expired.get(`${organizationId}:${eventId}`)) return immutable({ status: "retention_expired", eventId, expiredAt: this.#expired.get(`${organizationId}:${eventId}`) });
    return null;
  }
  expire(organizationId, eventId) {
    const index = this.#rows.findIndex((row) => row.organizationId === organizationId && row.eventId === eventId);
    if (index < 0) return false;
    this.#rows.splice(index, 1); this.#expired.set(`${organizationId}:${eventId}`, this.clock().toISOString()); return true;
  }
  export(organizationId, { actorId, capabilityGranted, correlationId, filters = {} } = {}) {
    if (capabilityGranted !== true) { const error = new Error("audit_export_capability_required"); error.code = "audit_export_capability_required"; error.status = 403; throw error; }
    const snapshot = this.list(organizationId, { ...filters, limit: 100 });
    const exportEvent = this.append(organizationId, { actorId, operation: "governance.audit.exported", targetType: "audit_export", outcome: "success", reasonCode: "capability_granted", correlationId, after: { exportedCount: snapshot.events.length, filters } });
    return immutable({ schemaVersion: AUDIT_SCHEMA_VERSION, exportedAt: this.clock().toISOString(), events: snapshot.events, auditEventId: exportEvent.eventId });
  }
}

const governanceAuditRepository = new GovernanceAuditRepository();
module.exports = { AUDIT_SCHEMA_VERSION, DEFAULT_RETENTION_CLASS, GovernanceAuditRepository, governanceAuditRepository, redactPayload, safeActor, safeTarget };
