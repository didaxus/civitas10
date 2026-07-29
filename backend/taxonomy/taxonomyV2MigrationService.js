"use strict";
const LEGACY_DIMENSIONS = Object.freeze(["academic.section", "academic.grade_level"]);
const TARGET_DIMENSIONS = Object.freeze(["academic.stage", "academic.cohort", "academic.class"]);
function migrationError(code, details) { return Object.assign(new Error(code), { code, details }); }
function createTaxonomyV2MigrationService({ repository, clock = () => new Date().toISOString() } = {}) {
  if (!repository) throw new Error("taxonomy_v2_migration_repository_required");
  async function plan({ organizationId, decisions = {} }) {
    if (!organizationId) throw migrationError("taxonomy_migration_tenant_required");
    const values = await repository.listValues({ organizationId });
    const assignments = await repository.listAssignments({ organizationId });
    const legacy = values.filter(v => LEGACY_DIMENSIONS.includes(v.dimensionKeyCache));
    const operations = [], unresolved = [], collisions = [];
    for (const value of legacy) {
      const decision = decisions[value.id];
      if (!decision) { unresolved.push({ valueId: value.id, dimensionKey: value.dimensionKeyCache, stableKey: value.stableKey }); continue; }
      if (!TARGET_DIMENSIONS.includes(decision.targetDimensionKey)) throw migrationError("taxonomy_migration_target_invalid", { valueId: value.id });
      const targetStableKey = decision.targetStableKey || value.stableKey;
      const existing = values.find(v => v.dimensionKeyCache === decision.targetDimensionKey && v.stableKey === targetStableKey);
      if (existing && existing.displayName !== value.displayName) { collisions.push({ valueId: value.id, targetValueId: existing.id, targetDimensionKey: decision.targetDimensionKey, targetStableKey }); continue; }
      operations.push({ source: value, decision, targetStableKey, existing, assignments: assignments.filter(a => a.dimensionValueId === value.id) });
    }
    return { organizationId, operations, unresolved, collisions };
  }
  async function migrate(input = {}) {
    const migrationId = input.migrationId || "taxonomy-v2";
    const previous = await repository.getMigrationEvidence?.(input.organizationId, migrationId);
    if (previous?.status === "applied") return { ...previous, idempotentReplay: true };
    const p = await plan(input);
    const evidence = { migrationId, organizationId: input.organizationId, registryVersion: "2026-07-v2", status: "planned", dryRun: input.dryRun !== false, createdAt: clock(), unresolved: p.unresolved, collisions: p.collisions, values: [], assignments: [] };
    if (p.unresolved.length) evidence.status = "migration_required";
    else if (p.collisions.length) evidence.status = "collision";
    else if (input.dryRun !== false) evidence.values = p.operations.map(o => ({ sourceId: o.source.id, targetDimensionKey: o.decision.targetDimensionKey, targetStableKey: o.targetStableKey, action: o.existing ? "reuse" : "create" }));
    if (evidence.status !== "planned" || input.dryRun !== false) { await repository.saveMigrationEvidence?.(evidence); return evidence; }
    const snapshot = await repository.snapshotTenant(input.organizationId);
    try {
      await repository.transaction(async tx => {
        for (const o of p.operations) {
          await tx.updateValue(o.source.id, { status: "deprecating", metadata: { ...o.source.metadata, migrationId } });
          const target = o.existing || await tx.insertValue({ logtoOrganizationId: input.organizationId, dimensionDefinitionId: o.decision.targetDimensionKey, dimensionKeyCache: o.decision.targetDimensionKey, stableKey: o.targetStableKey, displayName: o.source.displayName, status: "active", metadata: { migratedFromValueId: o.source.id, migrationId } });
          evidence.values.push({ sourceId: o.source.id, targetId: target.id, targetDimensionKey: o.decision.targetDimensionKey });
          for (const a of o.assignments) { await tx.updateAssignment(a.id, { dimensionKey: o.decision.targetDimensionKey, dimensionValueId: target.id, metadata: { ...a.metadata, migratedFromValueId: o.source.id, migrationId } }); evidence.assignments.push({ assignmentId: a.id, sourceValueId: o.source.id, targetValueId: target.id }); }
          await tx.updateValue(o.source.id, { status: "archived" });
        }
      });
      evidence.status = "applied"; evidence.rollbackSnapshot = snapshot; evidence.appliedAt = clock(); await repository.saveMigrationEvidence?.(evidence); return evidence;
    } catch (error) { await repository.restoreTenant(input.organizationId, snapshot); throw error; }
  }
  async function rollback({ organizationId, migrationId = "taxonomy-v2" }) {
    const evidence = await repository.getMigrationEvidence(organizationId, migrationId);
    if (!evidence?.rollbackSnapshot) throw migrationError("taxonomy_migration_rollback_unavailable");
    await repository.restoreTenant(organizationId, evidence.rollbackSnapshot);
    const result = { ...evidence, status: "rolled_back", rolledBackAt: clock() }; await repository.saveMigrationEvidence(result); return result;
  }
  return { plan, migrate, rollback };
}
module.exports = { LEGACY_DIMENSIONS, TARGET_DIMENSIONS, createTaxonomyV2MigrationService };
