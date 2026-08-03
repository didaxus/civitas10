const { randomUUID, createHash } = require("node:crypto");
const { assertPayloadSafe } = require("../services/integrationEvents");
const { assertOpaqueReference, generationReadModel, privateDocument, publicDocument, DocumentContractError } = require("./contracts");

const safeEvent = (type, row) => Object.freeze({ type, organizationId: row.organizationId, aggregateId: row.id, operationId: row.operationId || undefined, version: row.version });
const digest = (value) => createHash("sha256").update(value).digest("hex");

function createInMemoryDocumentRepository() {
  const documents = new Map(), operations = new Map(), idempotency = new Map(), outbox = [];
  const tenantKey = (org, id) => `${org}:${id}`;
  const repository = {
    documents, operations, outbox,
    transaction: async (fn) => fn(repository),
    async createGeneration(input) {
      const idem = tenantKey(input.organizationId, input.idempotencyKey);
      if (idempotency.has(idem)) return { operation: operations.get(tenantKey(input.organizationId, idempotency.get(idem))), duplicate: true };
      const operation = { ...input, id: randomUUID(), state: "queued", version: 1, acceptedAt: input.now.toISOString() };
      operations.set(tenantKey(input.organizationId, operation.id), operation); idempotency.set(idem, operation.id);
      return { operation, duplicate: false };
    },
    async appendOutbox(event) { assertPayloadSafe({ aggregateId: event.aggregateId, operationId: event.operationId, version: event.version }); if (!outbox.some((e) => e.organizationId === event.organizationId && e.type === event.type && e.aggregateId === event.aggregateId && e.version === event.version)) outbox.push(event); },
    async getOperation(org, id) { return operations.get(tenantKey(org, id)) || null; },
    async saveOperation(row) { operations.set(tenantKey(row.organizationId, row.id), row); return row; },
    async saveDocument(row) { documents.set(tenantKey(row.organizationId, row.id), row); return row; },
    async getDocument(org, id) { return documents.get(tenantKey(org, id)) || null; },
    async listExpired(now) { return [...documents.values()].filter((d) => !d.legalHold && d.retentionUntil && new Date(d.retentionUntil) <= now); },
    async deleteDocument(row) { documents.delete(tenantKey(row.organizationId, row.id)); }
  }; return repository;
}

function createDocumentService({ repository, storage, authorize, clock = () => new Date() } = {}) {
  if (!repository || !storage || !authorize) throw new Error("repository, storage and authorize are required");
  async function requestGeneration(input) {
    if (!input.organizationId || !input.idempotencyKey || !input.planVersion || !input.profileVersion || !input.templateVersion) throw new DocumentContractError("document_generation_invalid", "organizationId, idempotencyKey and frozen plan/profile/template versions are required");
    if (!(await authorize({ action: "documents.generate", organizationId: input.organizationId, principal: input.principal, request: input }))) throw new DocumentContractError("document_generation_forbidden", "generation forbidden");
    const now = clock();
    const result = await repository.transaction(async (tx = repository) => {
      const created = await tx.createGeneration({ organizationId: input.organizationId, idempotencyKey: input.idempotencyKey, templateId: input.templateId, parameters: input.parameters || {}, visibility: input.visibility || "private", planVersion: input.planVersion, profileVersion: input.profileVersion, templateVersion: input.templateVersion, classification: input.classification || "confidential", retentionClass: input.retentionClass || "standard", legalHold: Boolean(input.legalHold), maxAttempts: input.maxAttempts || 3, requestedBy: input.principal?.subject, now });
      if (!created.duplicate) await tx.appendOutbox(safeEvent("documents.generation.requested", { ...created.operation, organizationId: input.organizationId }));
      return created;
    });
    return { ...generationReadModel(result.operation), duplicate: result.duplicate };
  }
  async function runGeneration({ organizationId, operationId, render, workerId = "document-worker" }) {
    const op = await repository.getOperation(organizationId, operationId); if (!op) throw new DocumentContractError("document_operation_not_found", "operation not found");
    if (["succeeded", "cancelled"].includes(op.state)) return generationReadModel(op);
    let running = repository.claim ? await repository.claim(organizationId, operationId, workerId) : { ...op, state: "running", attempts: (op.attempts || 0) + 1, version: op.version + 1 };
    if (!running) return generationReadModel(await repository.getOperation(organizationId, operationId));
    if (!repository.claim) await repository.saveOperation(running);
    try {
      const bytes = await render({ templateId: op.templateId, parameters: op.parameters, planVersion: op.planVersion, profileVersion: op.profileVersion, templateVersion: op.templateVersion });
      const cancellation = await repository.getOperation(organizationId, operationId);
      if (cancellation.state === "cancelled" || cancellation.cancellationRequestedAt) return generationReadModel(cancellation);
      const stored = await storage.put({ organizationId, bytes, mediaType: "application/pdf" }); assertOpaqueReference(stored.fileReference);
      const now = clock(); const document = { id: randomUUID(), organizationId, operationId, title: op.templateId, mediaType: "application/pdf", visibility: op.visibility, fileReference: stored.fileReference, hash: stored.checksum || digest(bytes), sizeBytes: stored.sizeBytes ?? bytes.length, classification: op.classification || "confidential", retentionClass: op.retentionClass || "standard", version: 1, provenance: { generator: "canonical-worker", planVersion: op.planVersion, profileVersion: op.profileVersion, templateVersion: op.templateVersion, operationId }, retentionUntil: new Date(now.getTime() + 30 * 86400000).toISOString(), legalHold: Boolean(op.legalHold), createdAt: now.toISOString() };
      await repository.transaction(async (tx = repository) => { await tx.saveDocument(document); running = { ...running, documentId: document.id, state: "succeeded", version: running.version + 1, completedAt: now.toISOString() }; await tx.saveOperation(running); await tx.appendOutbox(safeEvent("documents.generation.succeeded", running)); });
      return generationReadModel(running);
    } catch (error) {
      const exhausted = (running.attempts || 1) >= (running.maxAttempts || 3) || !error.retryable;
      const failed = { ...running, state: "failed", version: running.version + 1, completedAt: exhausted ? clock().toISOString() : null, problem: { code: "document_generation_failed", retryable: Boolean(error.retryable) && !exhausted } }; await repository.saveOperation(failed); await repository.appendOutbox(safeEvent("documents.generation.failed", failed)); if (exhausted && repository.deadLetter) await repository.deadLetter(failed, "document_generation_attempts_exhausted"); throw error;
    }
  }
  async function cancel({ organizationId, operationId, principal }) { if (!(await authorize({ action: "documents.cancel", organizationId, principal, operationId }))) throw new DocumentContractError("document_cancel_forbidden", "cancel forbidden"); const op = await repository.getOperation(organizationId, operationId); if (!op) throw new DocumentContractError("document_operation_not_found", "operation not found"); if (["succeeded", "failed"].includes(op.state)) throw new DocumentContractError("document_operation_terminal", "terminal operation cannot be cancelled"); const row = { ...op, state: "cancelled", cancellationRequestedAt: clock().toISOString(), version: op.version + 1, completedAt: clock().toISOString() }; await repository.saveOperation(row); await repository.appendOutbox(safeEvent("documents.generation.cancelled", row)); return generationReadModel(row); }
  async function getOperation({ organizationId, operationId, principal }) { if (!(await authorize({ action: "documents.operation.read", organizationId, principal, operationId }))) throw new DocumentContractError("document_operation_forbidden", "operation forbidden"); const op = await repository.getOperation(organizationId, operationId); if (!op) throw new DocumentContractError("document_operation_not_found", "operation not found"); return generationReadModel(op); }
  async function getDocument({ organizationId, documentId, includePrivate = false }) { const row = await repository.getDocument(organizationId, documentId); if (!row) throw new DocumentContractError("document_not_found", "document not found"); return includePrivate ? privateDocument(row) : publicDocument(row); }
  async function authorizeDownload({ organizationId, documentId, principal }) { const row = await repository.getDocument(organizationId, documentId); if (!row) throw new DocumentContractError("document_not_found", "document not found"); if (!(await authorize({ action: "documents.download", organizationId, principal, document: row }))) throw new DocumentContractError("document_download_forbidden", "download forbidden"); const signed = await storage.signDownload({ organizationId, fileReference: assertOpaqueReference(row.fileReference), expiresInSeconds: 60 }); return { url: signed.url, expiresAt: signed.expiresAt, documentId }; }
  async function enforceRetention() { const expired = await repository.listExpired(clock()); for (const row of expired) { await storage.delete({ organizationId: row.organizationId, fileReference: row.fileReference }); await repository.deleteDocument(row); await repository.appendOutbox(safeEvent("documents.retention.deleted", row)); } return expired.length; }
  return { requestGeneration, runGeneration, cancel, getOperation, getDocument, authorizeDownload, enforceRetention };
}
module.exports = { createDocumentService, createInMemoryDocumentRepository };
