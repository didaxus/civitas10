"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("organization mapping persistence migration is tenant scoped and does not repurpose authorization scopes", () => {
  const sql = fs.readFileSync("backend/db/migrations/0037_organization_mapping_persistence.sql", "utf8");
  for (const table of ["organization_mapping_drafts","organization_mapping_policy_versions","organization_mapping_source_snapshots","organization_mapping_evaluations","organization_mapping_reviews","organization_dimension_configurations","organization_mapping_audit_events","organization_mapping_idempotency_keys"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql,/shared integration_outbox_events foundation/);
  assert.doesNotMatch(sql,/CREATE TABLE IF NOT EXISTS organization_mapping_outbox_events/);
  assert.match(sql, /organization_id TEXT NOT NULL/);
  assert.match(sql, /version INTEGER NOT NULL/);
  assert.match(sql, /CHECK \(outcome IN \('matched','not_matched','ambiguous','incompatible'\)\)/);
  assert.match(sql, /PRIMARY KEY\(organization_id,idempotency_key\)/);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+authorization_scope_assignments/i);
  assert.doesNotMatch(sql, /INSERT\s+INTO\s+authorization_scope_assignments/i);
});
