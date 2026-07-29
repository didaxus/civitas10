"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Planning, PLANNING_STATES, ERROR_CODES } = require("../planning/domain");

function plan() { return Planning.create({ organizationId: "org-a", id: "same-id", profileId: "default", name: "Annual", content: { year: 2027 }, actorId: "author" }); }

test("Planning enforces transitions and rejection invariants", () => {
  const aggregate = plan();
  assert.throws(() => aggregate.transition(PLANNING_STATES.APPROVED, { actorId: "reviewer" }), { code: ERROR_CODES.INVALID_TRANSITION });
  aggregate.transition(PLANNING_STATES.IN_REVIEW, { actorId: "author" });
  assert.throws(() => aggregate.transition(PLANNING_STATES.CHANGES_REQUESTED, { actorId: "reviewer" }), { code: ERROR_CODES.INVALID_ARGUMENT });
  aggregate.transition(PLANNING_STATES.CHANGES_REQUESTED, { actorId: "reviewer", reason: "Missing budget" });
  aggregate.revise({ content: { year: 2027, budget: 10 }, actorId: "author" });
  assert.equal(aggregate.currentVersion, 2);
  assert.equal(aggregate.versions.length, 2);
});

test("approved planning version cannot be revised and history is preserved", () => {
  const aggregate = plan();
  aggregate.transition(PLANNING_STATES.IN_REVIEW, { actorId: "author" });
  aggregate.transition(PLANNING_STATES.APPROVED, { actorId: "reviewer" });
  assert.throws(() => aggregate.revise({ content: { changed: true }, actorId: "author" }), { code: ERROR_CODES.APPROVED_VERSION_IMMUTABLE });
  assert.deepEqual(aggregate.versions[0].content, { year: 2027 });
  aggregate.transition(PLANNING_STATES.ARCHIVED, { actorId: "reviewer" });
  assert.equal(aggregate.versions[0].state, PLANNING_STATES.APPROVED);
});
