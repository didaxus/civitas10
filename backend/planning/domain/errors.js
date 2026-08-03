"use strict";

class PlanningDomainError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "PlanningDomainError";
    this.code = code;
    this.details = details;
  }
}

const ERROR_CODES = Object.freeze({
  INVALID_ARGUMENT: "planning.invalid_argument",
  INVALID_TRANSITION: "planning.invalid_transition",
  APPROVED_VERSION_IMMUTABLE: "planning.approved_version_immutable",
  VERSION_CONFLICT: "planning.version_conflict",
  NOT_FOUND: "planning.not_found",
  IDEMPOTENCY_CONFLICT: "planning.idempotency_conflict",
});

module.exports = { ERROR_CODES, PlanningDomainError };
