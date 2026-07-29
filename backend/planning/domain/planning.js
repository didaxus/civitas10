"use strict";

const { randomUUID } = require("node:crypto");
const { ERROR_CODES, PlanningDomainError } = require("./errors");

const PLANNING_STATES = Object.freeze({
  DRAFT: "draft",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  ARCHIVED: "archived",
});

const TRANSITIONS = Object.freeze({
  [PLANNING_STATES.DRAFT]: [PLANNING_STATES.IN_REVIEW, PLANNING_STATES.ARCHIVED],
  [PLANNING_STATES.IN_REVIEW]: [PLANNING_STATES.APPROVED, PLANNING_STATES.REJECTED],
  [PLANNING_STATES.REJECTED]: [PLANNING_STATES.DRAFT, PLANNING_STATES.ARCHIVED],
  [PLANNING_STATES.APPROVED]: [PLANNING_STATES.ARCHIVED],
  [PLANNING_STATES.ARCHIVED]: [],
});

function required(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new PlanningDomainError(ERROR_CODES.INVALID_ARGUMENT, `${name} is required`, { field: name });
  }
  return value.trim();
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

class Planning {
  constructor(snapshot) {
    this.organizationId = required(snapshot.organizationId, "organizationId");
    this.id = required(snapshot.id, "id");
    this.profileId = required(snapshot.profileId, "profileId");
    this.name = required(snapshot.name, "name");
    this.state = snapshot.state;
    this.currentVersion = snapshot.currentVersion;
    this.revision = snapshot.revision;
    this.versions = clone(snapshot.versions || []);
    this.createdAt = snapshot.createdAt;
    this.updatedAt = snapshot.updatedAt;
    this._events = [];
    this.#assertInvariant();
  }

  static create({ organizationId, id = randomUUID(), profileId, name, content, actorId, now = new Date() }) {
    required(actorId, "actorId");
    if (content == null || typeof content !== "object" || Array.isArray(content)) {
      throw new PlanningDomainError(ERROR_CODES.INVALID_ARGUMENT, "content must be an object");
    }
    const aggregate = new Planning({
      organizationId, id, profileId, name, state: PLANNING_STATES.DRAFT,
      currentVersion: 1, revision: 1,
      versions: [{ version: 1, state: PLANNING_STATES.DRAFT, content: clone(content), createdBy: actorId, createdAt: now }],
      createdAt: now, updatedAt: now,
    });
    aggregate.#record("planning.plan.created", actorId, { version: 1 });
    return aggregate;
  }

  static restore(snapshot) { return new Planning(snapshot); }

  revise({ content, actorId, now = new Date() }) {
    required(actorId, "actorId");
    if (this.state === PLANNING_STATES.APPROVED) {
      throw new PlanningDomainError(ERROR_CODES.APPROVED_VERSION_IMMUTABLE, "Approved versions cannot be modified");
    }
    if (![PLANNING_STATES.DRAFT, PLANNING_STATES.REJECTED].includes(this.state)) {
      throw new PlanningDomainError(ERROR_CODES.INVALID_TRANSITION, `Cannot revise a plan in ${this.state}`);
    }
    if (content == null || typeof content !== "object" || Array.isArray(content)) {
      throw new PlanningDomainError(ERROR_CODES.INVALID_ARGUMENT, "content must be an object");
    }
    if (this.state === PLANNING_STATES.REJECTED) this.#transition(PLANNING_STATES.DRAFT, actorId, now);
    this.currentVersion += 1;
    this.revision += 1;
    this.updatedAt = now;
    this.versions.push({ version: this.currentVersion, state: PLANNING_STATES.DRAFT, content: clone(content), createdBy: actorId, createdAt: now });
    this.#record("planning.plan.revised", actorId, { version: this.currentVersion });
    this.#assertInvariant();
    return this;
  }

  transition(toState, { actorId, reason = null, now = new Date() }) {
    required(actorId, "actorId");
    this.#transition(toState, actorId, now, reason);
    return this;
  }

  #transition(toState, actorId, now, reason = null) {
    if (!(TRANSITIONS[this.state] || []).includes(toState)) {
      throw new PlanningDomainError(ERROR_CODES.INVALID_TRANSITION, `Transition ${this.state} -> ${toState} is not allowed`, { from: this.state, to: toState });
    }
    if (toState === PLANNING_STATES.REJECTED && !String(reason || "").trim()) {
      throw new PlanningDomainError(ERROR_CODES.INVALID_ARGUMENT, "A rejection reason is required");
    }
    const from = this.state;
    this.state = toState;
    this.revision += 1;
    this.updatedAt = now;
    const version = this.versions.find((item) => item.version === this.currentVersion);
    if (toState === PLANNING_STATES.APPROVED) {
      version.state = PLANNING_STATES.APPROVED;
      version.approvedBy = actorId;
      version.approvedAt = now;
    }
    this.#record(`planning.plan.${toState}`, actorId, { from, to: toState, version: this.currentVersion, reason });
    this.#assertInvariant();
  }

  #record(type, actorId, payload) {
    this._events.push({ eventId: randomUUID(), type, actorId, occurredAt: this.updatedAt, payload });
  }

  pullEvents() { const events = this._events; this._events = []; return clone(events); }

  toSnapshot() {
    return clone({ organizationId: this.organizationId, id: this.id, profileId: this.profileId, name: this.name,
      state: this.state, currentVersion: this.currentVersion, revision: this.revision,
      versions: this.versions, createdAt: this.createdAt, updatedAt: this.updatedAt });
  }

  #assertInvariant() {
    if (!Object.values(PLANNING_STATES).includes(this.state) || !Number.isInteger(this.currentVersion) || this.currentVersion < 1 ||
        !Number.isInteger(this.revision) || this.revision < 1 || this.versions.length < 1 ||
        !this.versions.some((item) => item.version === this.currentVersion)) {
      throw new PlanningDomainError(ERROR_CODES.INVALID_ARGUMENT, "Invalid planning aggregate snapshot");
    }
    const numbers = this.versions.map((item) => item.version);
    if (new Set(numbers).size !== numbers.length || Math.max(...numbers) !== this.currentVersion ||
        [...numbers].sort((a, b) => a - b).some((number, index) => number !== index + 1)) {
      throw new PlanningDomainError(ERROR_CODES.INVALID_ARGUMENT, "Planning versions must be unique and contiguous");
    }
  }
}

module.exports = { Planning, PLANNING_STATES, TRANSITIONS };
