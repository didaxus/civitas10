const { randomUUID, createHash } = require("node:crypto");
const { assertPayloadSafe } = require("../services/integrationEvents");
const { assertOpaqueReference, generationReadModel, privateDocument, publicDocument, DocumentContractError } = require("./contracts");

const safeEvent = (type, row) => Object.freeze({ type, organizationId: row.organizationId, aggregateId: row.id, operationId: row.operationId || undefined, version: row.version });
const digest = (value) => createHash("sha256").update(value).digest("hex");

function createInMemoryDocumentRepository() {
  const documents = new Map(), operations = new Map(), idempotency = new Map(), outbox = [];
  const tenantKey = (org, id) => `${org}:${id}`;
  return {
    documents, operations, outbox,
    transaction: async (fn) => fn(),
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
  };
}

function createDocumentService({ repository, storage, authorize, clock = () => new Date() } = {}) {
  if (!repository || !storage || !authorize) throw new Error("repository, storage and authorize are required");
  async function requestGeneration(input) {
    if (!input.organizationId || !input.idempotencyKey) throw new DocumentContractError("document_generation_invalid", "organizationId and idempotencyKey are required");
    const now = clock();
    const result = await repository.transaction(async () => {
      const created = await repository.createGeneration({ organizationId: input.organizationId, idempotencyKey: input.idempotencyKey, templateId: input.templateId, parameters: input.parameters || {}, visibility: input.visibility || "private", requestedBy: input.principal?.subject, now });
      if (!created.duplicate) await repository.appendOutbox(safeEvent("documents.generation.requested", { ...created.operation, organizationId: input.organizationId }));
      return created;
    });
    return { ...generationReadModel(result.operation), duplicate: result.duplicate };
  }
  async function runGeneration({ organizationId, operationId, render }) {
    const op = await repository.getOperation(organizationId, operationId); if (!op) throw new DocumentContractError("document_operation_not_found", "operation not found");
    if (["succeeded", "cancelled"].includes(op.state)) return generationReadModel(op);
    let running = { ...op, state: "running", version: op.version + 1 }; await repository.saveOperation(running);
    try {
      const bytes = await render({ templateId: op.templateId, parameters: op.parameters });
      const stored = await storage.put({ organizationId, bytes, mediaType: "application/pdf" }); assertOpaqueReference(stored.fileReference);
      const now = clock(); const document = { id: randomUUID(), organizationId, operationId, title: op.templateId, mediaType: "application/pdf", visibility: op.visibility, fileReference: stored.fileReference, hash: digest(bytes), version: 1, provenance: { generator: "canonical-worker", templateId: op.templateId, operationId }, retentionUntil: new Date(now.getTime() + 30 * 86400000).toISOString(), legalHold: false, createdAt: now.toISOString() };
      await repository.transaction(async () => { await repository.saveDocument(document); running = { ...running, documentId: document.id, state: "succeeded", version: running.version + 1, completedAt: now.toISOString() }; await repository.saveOperation(running); await repository.appendOutbox(safeEvent("documents.generation.succeeded", running)); });
      return generationReadModel(running);
    } catch (error) {
      const failed = { ...running, state: "failed", version: running.version + 1, completedAt: clock().toISOString(), problem: { code: "document_generation_failed", retryable: Boolean(error.retryable) } }; await repository.saveOperation(failed); await repository.appendOutbox(safeEvent("documents.generation.failed", failed)); throw error;
    }
  }
  async function cancel({ organizationId, operationId }) { const op = await repository.getOperation(organizationId, operationId); if (!op) throw new DocumentContractError("document_operation_not_found", "operation not found"); if (["succeeded", "failed"].includes(op.state)) throw new DocumentContractError("document_operation_terminal", "terminal operation cannot be cancelled"); const row = { ...op, state: "cancelled", version: op.version + 1, completedAt: clock().toISOString() }; await repository.saveOperation(row); await repository.appendOutbox(safeEvent("documents.generation.cancelled", row)); return generationReadModel(row); }
  async function getDocument({ organizationId, documentId, includePrivate = false }) { const row = await repository.getDocument(organizationId, documentId); if (!row) throw new DocumentContractError("document_not_found", "document not found"); return includePrivate ? privateDocument(row) : publicDocument(row); }
  async function authorizeDownload({ organizationId, documentId, principal }) { const row = await repository.getDocument(organizationId, documentId); if (!row) throw new DocumentContractError("document_not_found", "document not found"); if (!(await authorize({ action: "documents.download", organizationId, principal, document: row }))) throw new DocumentContractError("document_download_forbidden", "download forbidden"); const signed = await storage.signDownload({ organizationId, fileReference: assertOpaqueReference(row.fileReference), expiresInSeconds: 60 }); return { url: signed.url, expiresAt: signed.expiresAt, documentId }; }
  async function enforceRetention() { const expired = await repository.listExpired(clock()); for (const row of expired) { await storage.delete({ organizationId: row.organizationId, fileReference: row.fileReference }); await repository.deleteDocument(row); await repository.appendOutbox(safeEvent("documents.retention.deleted", row)); } return expired.length; }
  return { requestGeneration, runGeneration, cancel, getDocument, authorizeDownload, enforceRetention };
}
module.exports = { createDocumentService, createInMemoryDocumentRepository };
