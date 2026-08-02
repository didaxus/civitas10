const DOCUMENT_VISIBILITIES = Object.freeze(["public", "private"]);
const GENERATION_STATES = Object.freeze(["accepted", "queued", "running", "succeeded", "failed", "cancelled"]);

class DocumentContractError extends Error {
  constructor(code, message) { super(message); this.name = "DocumentContractError"; this.code = code; }
}

function assertOpaqueReference(value, field = "fileReference") {
  if (typeof value !== "string" || !/^file_[A-Za-z0-9_-]{16,180}$/.test(value)) throw new DocumentContractError("document_invalid_file_reference", `${field} must be an opaque file reference`);
  if (/:\/\/|\?|#|\//.test(value)) throw new DocumentContractError("document_invalid_file_reference", `${field} cannot contain a URL or path`);
  return value;
}

function publicDocument(document) {
  return Object.freeze({ documentId: document.id, title: document.title, mediaType: document.mediaType, version: document.version, hash: document.hash, provenance: document.provenance, createdAt: document.createdAt });
}

function privateDocument(document) {
  return Object.freeze({ ...publicDocument(document), fileReference: assertOpaqueReference(document.fileReference), retentionUntil: document.retentionUntil, legalHold: Boolean(document.legalHold), visibility: document.visibility });
}

function generationReadModel(operation) {
  return Object.freeze({ operationId: operation.id, documentId: operation.documentId || null, state: operation.state, version: operation.version, attempts: operation.attempts || 0, maxAttempts: operation.maxAttempts || 3, acceptedAt: operation.acceptedAt, completedAt: operation.completedAt || null, problem: operation.problem || null });
}

module.exports = { DOCUMENT_VISIBILITIES, GENERATION_STATES, DocumentContractError, assertOpaqueReference, publicDocument, privateDocument, generationReadModel };
