"use strict";
const PRESETS = Object.freeze({
  school_k12: { version: "2026-07-v2", values: [
    ["academic.stage","primary","Primary",null,10], ["academic.stage","middle","Middle",null,20], ["academic.stage","high","High",null,30],
    ["academic.subject","mathematics","Mathematics",null,10], ["academic.subject","social_studies","Social studies",null,20], ["academic.subject","spanish","Spanish",null,30], ["academic.subject","english","English",null,40],
    ["organization.department","billing","Billing",null,10], ["administration.function","facturacion","Facturación",null,10]
  ]},
  school_international: { version: "2026-07-v2", values: [["academic.stage","elementary","Elementary",null,10],["academic.stage","baccalaureate","Baccalaureate",null,20]] },
  higher_education: { version: "2026-07-v2", values: [["organization.campus","main","Main campus",null,10],["organization.department","mathematics","Mathematics department",null,10]] },
  corporate_training: { version: "2026-07-v2", values: [["organization.department","learning","Learning",null,10],["administration.function","billing","Billing",null,20]] },
  generic_organization: { version: "2026-07-v2", values: [["organization.department","operations","Operations",null,10]] },
});
function createTaxonomyPresetService({ taxonomyService, repository } = {}) {
  return { PRESETS, async applyPreset({ organizationId, presetKey, actorLogtoUserId, idempotencyKey } = {}) {
    if (idempotencyKey) { const cached = await repository.getIdempotency(idempotencyKey); if (cached) return cached; }
    const preset = PRESETS[presetKey]; if (!preset) throw Object.assign(new Error("taxonomy_preset_unknown"), { code: "taxonomy_preset_unknown" });
    const created = []; const conflicts = [];
    for (const [dimensionKey, stableKey, displayName, parentStableKey, sortOrder] of preset.values) {
      const value = await taxonomyService.createValue({ organizationId, dimensionKey, stableKey, displayName, actorLogtoUserId, metadata: { presetKey, presetVersion: preset.version, parentStableKey: parentStableKey || undefined }, expectedTaxonomyCatalogVersion: undefined });
      if (value.status !== "draft") conflicts.push({ dimensionKey, stableKey }); else created.push({ id: value.id, dimensionKey, stableKey, sortOrder });
    }
    const result = { presetKey, version: preset.version, created, conflicts };
    if (idempotencyKey) await repository.setIdempotency(idempotencyKey, result);
    return result;
  }};
}
module.exports = { createTaxonomyPresetService, PRESETS };
