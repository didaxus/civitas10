"use strict";

const { validateRoleAlias } = require("./roleLabelValidation");

function createRoleLabelService({ repository, resolver, canonicalRoleCatalog } = {}) {
  async function assertCanonical(canonicalRoleId) {
    if (!await canonicalRoleCatalog.getById({ canonicalRoleId })) { const error = new Error("Canonical role not found."); error.code = "canonical_role_not_found"; error.status = 404; throw error; }
  }
  return {
    async update({ organizationId, canonicalRoleId, alias, expectedEtag, actorLogtoUserId }) {
      await assertCanonical(canonicalRoleId);
      const saved = await repository.update({ organizationId, canonicalRoleId, alias: validateRoleAlias(alias), expectedEtag, actorLogtoUserId });
      resolver.invalidate({ organizationId, canonicalRoleId });
      return resolver.resolve({ organizationId, canonicalRoleId }).then((label) => ({ ...label, version: saved.version, etag: saved.etag }));
    },
    async reset({ organizationId, canonicalRoleId, expectedEtag, actorLogtoUserId }) {
      await assertCanonical(canonicalRoleId);
      const saved = await repository.reset({ organizationId, canonicalRoleId, expectedEtag, actorLogtoUserId });
      resolver.invalidate({ organizationId, canonicalRoleId });
      return resolver.resolve({ organizationId, canonicalRoleId }).then((label) => ({ ...label, version: saved.version, etag: saved.etag }));
    },
  };
}

module.exports = { createRoleLabelService };
