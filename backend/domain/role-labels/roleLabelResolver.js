"use strict";

class RoleLabelNotFoundError extends Error {
  constructor(canonicalRoleId) { super(`Canonical role ${canonicalRoleId} was not found.`); this.name = "RoleLabelNotFoundError"; this.code = "canonical_role_not_found"; this.status = 404; }
}

class RoleLabelResolver {
  constructor({ repository, canonicalRoleCatalog, cache = new Map() } = {}) {
    if (!repository || !canonicalRoleCatalog) throw new TypeError("repository and canonicalRoleCatalog are required");
    this.repository = repository;
    this.canonicalRoleCatalog = canonicalRoleCatalog;
    this.cache = cache;
  }
  cacheKey(organizationId, canonicalRoleId) { return `${organizationId}\0${canonicalRoleId}`; }
  async resolve({ organizationId, canonicalRoleId }) {
      if (!organizationId || !canonicalRoleId) throw new TypeError("organizationId and canonicalRoleId are required");
      const key = this.cacheKey(organizationId, canonicalRoleId);
      if (this.cache.has(key)) return structuredClone(this.cache.get(key));
      const canonical = await this.canonicalRoleCatalog.getById({ canonicalRoleId });
      if (!canonical) throw new RoleLabelNotFoundError(canonicalRoleId);
      const state = await (this.repository.getState?.({ organizationId, canonicalRoleId }) || this.repository.get({ organizationId, canonicalRoleId }));
      const stored = state?.alias == null ? null : state;
      const result = Object.freeze({
        canonicalRoleId,
        canonicalKey: canonical.canonicalKey,
        defaultName: canonical.defaultName,
        effectiveAlias: stored?.alias || canonical.defaultName,
        provenance: stored ? { source: "organization_alias", organizationId, version: stored.version, etag: stored.etag, updatedAt: stored.updatedAt } : { source: "canonical_default", organizationId, version: state?.version || 0, etag: state?.etag || '"role-alias-v0"', updatedAt: state?.updatedAt || null },
      });
      this.cache.set(key, result);
      return structuredClone(result);
  }
  invalidate({ organizationId, canonicalRoleId }) { this.cache.delete(this.cacheKey(organizationId, canonicalRoleId)); }
}

function createRoleLabelResolver(options) { return new RoleLabelResolver(options); }

module.exports = { RoleLabelNotFoundError, RoleLabelResolver, createRoleLabelResolver };
