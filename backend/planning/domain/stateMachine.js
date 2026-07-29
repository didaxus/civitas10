"use strict";

const PLANNING_STATES = Object.freeze({
  DRAFT: "draft",
  IN_REVIEW: "in_review",
  CHANGES_REQUESTED: "changes_requested",
  APPROVED: "approved",
  ARCHIVED: "archived",
});

const TRANSITIONS = Object.freeze({
  [PLANNING_STATES.DRAFT]: Object.freeze([PLANNING_STATES.IN_REVIEW, PLANNING_STATES.ARCHIVED]),
  [PLANNING_STATES.IN_REVIEW]: Object.freeze([PLANNING_STATES.CHANGES_REQUESTED, PLANNING_STATES.APPROVED]),
  [PLANNING_STATES.CHANGES_REQUESTED]: Object.freeze([PLANNING_STATES.DRAFT, PLANNING_STATES.ARCHIVED]),
  [PLANNING_STATES.APPROVED]: Object.freeze([PLANNING_STATES.DRAFT, PLANNING_STATES.ARCHIVED]),
  [PLANNING_STATES.ARCHIVED]: Object.freeze([]),
});

function isPlanningState(value) { return Object.values(PLANNING_STATES).includes(value); }
function canTransition(from, to) { return Boolean(TRANSITIONS[from]?.includes(to)); }

module.exports = { PLANNING_STATES, TRANSITIONS, isPlanningState, canTransition };
