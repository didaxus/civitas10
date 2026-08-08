"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("migration freezes academic.period as reconciliation-required without repurposing data scopes", () => {
  const sql = fs.readFileSync("backend/db/migrations/0036_organization_mapping_vocabulary_reconciliation.sql", "utf8");
  assert.match(sql, /organization_model_dimension_reconciliation/);
  assert.match(sql, /academic\.period/);
  assert.match(sql, /reconciliation_required/);
  assert.doesNotMatch(sql, /UPDATE\s+authorization_scope_assignments/i);
  assert.doesNotMatch(sql, /ALTER\s+TABLE\s+authorization_scope_assignments/i);
  assert.match(sql, /organization_id/);
});
