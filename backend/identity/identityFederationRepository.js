"use strict";
const crypto = require("crypto");
const clone = (v) => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
const stableSecretFree = (row = {}) => { const { clientSecret, secret, password, privateKey, secretReference, ...safe } = row; return { ...safe, secretConfigured: Boolean(secretReference || clientSecret || secret || password || privateKey) }; };
function createInMemoryIdentityFederationRepository() {
  const connections = new Map(), roleMappings = new Map(), scopeMappings = new Map(), policies = new Map(), runs = new Map();
  const audits = [], outbox = [], idempotency = new Map();
  const uuid = () => crypto.randomUUID();
  const list = (m, org) => [...m.values()].filter((r) => r.logtoOrganizationId === org).map(clone);
  return {
    audits, outbox,
    async transaction(fn) { return fn(this); },
    async replayIdempotency(key) { return key ? clone(idempotency.get(key)) : null; },
    async rememberIdempotency(key, value) { if (key) idempotency.set(key, clone(value)); return value; },
    async audit(event) { audits.push(clone(event)); return event; },
    async enqueueOutbox(event) { outbox.push(clone(event)); return event; },
    async listConnections(org) { return list(connections, org).map(stableSecretFree); },
    async getConnection(org, id) { const row = connections.get(id); return row?.logtoOrganizationId === org ? stableSecretFree(clone(row)) : null; },
    async saveConnection(input) { const prev = input.id ? connections.get(input.id) : null; const row = { status: "draft", claimContractVersion: 1, mappingVersion: 1, provisioningPolicyVersion: 1, version: prev ? Number(prev.version || 1) + 1 : 1, id: input.id || uuid(), createdAt: prev?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), ...prev, ...input }; connections.set(row.id, row); return stableSecretFree(clone(row)); },
    async listRoleMappings(org) { return list(roleMappings, org); },
    async getRoleMapping(org, id) { const row = roleMappings.get(id); return row?.logtoOrganizationId === org ? clone(row) : null; },
    async saveRoleMapping(input) { const prev = input.id ? roleMappings.get(input.id) : null; const row = { status: "active", version: prev ? Number(prev.version || 1) + 1 : 1, id: input.id || uuid(), createdAt: prev?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), ...prev, ...input }; roleMappings.set(row.id, row); return clone(row); },
    async deleteRoleMapping(org, id) { const row = await this.getRoleMapping(org, id); if (row) roleMappings.delete(id); return row; },
    async listScopeMappings(org) { return list(scopeMappings, org); },
    async saveScopeMapping(input) { const prev = input.id ? scopeMappings.get(input.id) : null; const row = { status: "active", version: prev ? Number(prev.version || 1) + 1 : 1, id: input.id || uuid(), createdAt: prev?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), ...prev, ...input }; scopeMappings.set(row.id, row); return clone(row); },
    async getPolicy(org) { return clone(policies.get(org)); },
    async savePolicy(input) { const prev = policies.get(input.logtoOrganizationId); const row = { version: prev ? Number(prev.version || 1) + 1 : 1, updatedAt: new Date().toISOString(), ...prev, ...input }; policies.set(row.logtoOrganizationId, row); return clone(row); },
    async createRun(input) { const row = { id: uuid(), status: "queued", startedAt: new Date().toISOString(), totalSubjects: 0, createdCount: 0, updatedCount: 0, removedCount: 0, blockedCount: 0, errorCount: 0, ...input }; runs.set(row.id, row); return clone(row); },
    async listRuns(org) { return list(runs, org); },
    async getRun(org, id) { const row = runs.get(id); return row?.logtoOrganizationId === org ? clone(row) : null; },
  };
}
module.exports = { createInMemoryIdentityFederationRepository };
