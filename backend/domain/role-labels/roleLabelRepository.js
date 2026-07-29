"use strict";

const crypto = require("node:crypto");
const { aliasUniquenessKey } = require("./roleLabelValidation");

function clone(value) { return value == null ? null : structuredClone(value); }
function etagFor(version) { return `"role-alias-v${Number(version)}"`; }

class RoleLabelConflictError extends Error {
  constructor(code, message) { super(message); this.name = "RoleLabelConflictError"; this.code = code; this.status = 412; }
}

function createInMemoryRoleLabelRepository() {
  const aliases = new Map();
  const audits = [];
  const outbox = [];
  const key = (organizationId, canonicalRoleId) => `${organizationId}\0${canonicalRoleId}`;
  return {
    kind: "in-memory-test-double", audits, outbox,
    async get({ organizationId, canonicalRoleId }) { const row = aliases.get(key(organizationId, canonicalRoleId)); return row?.alias == null ? null : clone(row); },
    async getState({ organizationId, canonicalRoleId }) { return clone(aliases.get(key(organizationId, canonicalRoleId))); },
    async list({ organizationId }) { return clone([...aliases.values()].filter((row) => row.organizationId === organizationId && row.alias != null)); },
    async update({ organizationId, canonicalRoleId, alias, expectedEtag, actorLogtoUserId, now = new Date() }) {
      const current = aliases.get(key(organizationId, canonicalRoleId)) || null;
      if (expectedEtag !== etagFor(current?.version || 0)) throw new RoleLabelConflictError("role_alias_etag_conflict", "Role alias has changed; reload it before retrying.");
      const normalizedAlias = aliasUniquenessKey(alias);
      if ([...aliases.values()].some((row) => row.organizationId === organizationId && row.alias != null && row.canonicalRoleId !== canonicalRoleId && row.aliasUniquenessKey === normalizedAlias)) {
        const error = new RoleLabelConflictError("role_alias_not_unique", "Role alias must be unique within the organization."); error.status = 409; throw error;
      }
      const version = (current?.version || 0) + 1;
      const saved = { organizationId, canonicalRoleId, alias, aliasUniquenessKey: normalizedAlias, version, etag: etagFor(version), updatedAt: now.toISOString() };
      aliases.set(key(organizationId, canonicalRoleId), saved);
      record(saved, current, actorLogtoUserId, "role_alias.updated");
      return clone(saved);
    },
    async reset({ organizationId, canonicalRoleId, expectedEtag, actorLogtoUserId, now = new Date() }) {
      const current = aliases.get(key(organizationId, canonicalRoleId)) || null;
      if (!current || expectedEtag !== current.etag) throw new RoleLabelConflictError("role_alias_etag_conflict", "Role alias has changed; reload it before retrying.");
      const version = current.version + 1;
      const result = { organizationId, canonicalRoleId, alias: null, aliasUniquenessKey: null, version, etag: etagFor(version), updatedAt: now.toISOString() };
      aliases.set(key(organizationId, canonicalRoleId), result);
      record(result, current, actorLogtoUserId, "role_alias.reset");
      return clone(result);
    },
  };
  function record(after, before, actorLogtoUserId, action) {
    const event = { id: crypto.randomUUID(), action, organizationId: after.organizationId, canonicalRoleId: after.canonicalRoleId, actorLogtoUserId: actorLogtoUserId || null, version: after.version, before: before ? { alias: "[REDACTED]", version: before.version } : null, after: { alias: after.alias == null ? null : "[REDACTED]", version: after.version } };
    audits.push(clone(event));
    outbox.push(clone({ ...event, type: action, payload: { organizationId: event.organizationId, canonicalRoleId: event.canonicalRoleId, version: event.version, before: event.before, after: event.after } }));
  }
}

module.exports = { RoleLabelConflictError, createInMemoryRoleLabelRepository, etagFor };
