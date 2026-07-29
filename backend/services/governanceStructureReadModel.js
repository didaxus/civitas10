"use strict";

const { createTaxonomyService, createTaxonomyPublicationService } = require("../taxonomy");
const { createUnitService } = require("../organization-structure");
const { createDataScopeAssignmentService, isEffectiveAssignment } = require("../authorization/data-scope");

function createGovernanceStructureReadModel({ taxonomyRepository, unitRepository, dataScopeRepository, runtimeConsistencyPort, auditPort, outboxPort } = {}) {
  if (!taxonomyRepository || !unitRepository || !dataScopeRepository || !runtimeConsistencyPort || !auditPort || !outboxPort) throw new Error("governance_structure_ports_required");

const safeActor = (req) => req?.user?.sub || req?.user?.id || "system";

function taxonomyService() { return createTaxonomyService({ repository: taxonomyRepository, runtimeConsistencyPort }); }
function taxonomyPublicationService() { return createTaxonomyPublicationService({ repository: taxonomyRepository, runtimeConsistencyPort }); }
function unitService() { return createUnitService({ repository: unitRepository, taxonomyPort: taxonomyService(), runtimeConsistencyPort }); }
function dataScopeService() { return createDataScopeAssignmentService({ repository: dataScopeRepository, taxonomyPort: taxonomyService(), unitPort: unitRepository, runtimeConsistencyPort }); }

async function taxonomySummary(organizationId) {
  await taxonomyService().ensureDefinitions();
  const state = await taxonomyRepository.getState(organizationId);
  const values = await taxonomyRepository.listValues({ organizationId });
  return { state, items: values.map((value) => ({ id: value.id, dimension: value.dimensionKeyCache, stableKey: value.stableKey, label: value.displayName, parentId: value.parentValueId || undefined, status: value.status, assignable: value.status === "active", sourceVersion: String(state.taxonomyCatalogVersion || 0) })) };
}

async function unitsSummary(organizationId) {
  const versions = await unitRepository.getVersions(organizationId);
  const units = await unitRepository.listUnits({ organizationId });
  const memberships = await unitRepository.listMemberships({ organizationId });
  const groups = await unitRepository.listCapabilityGroups({ organizationId });
  return { versions, items: units.map((unit) => ({ id: unit.id, label: unit.displayName, stableKey: unit.stableKey, unitType: unit.unitType, hierarchyKey: unit.hierarchyKey, parentId: unit.parentUnitId || undefined, status: unit.status, memberCount: memberships.filter((membership) => membership.unitId === unit.id && membership.status === "active").length, relationshipCount: memberships.filter((membership) => membership.unitId === unit.id).length, capabilityGroupCount: groups.filter((group) => group.unitId === unit.id).length, reconciliationStatus: groups.some((group) => group.syncStatus !== "reconciled") ? "pending" : "reconciled", sourceVersion: String(versions.unitGraphVersion || 0) })) };
}

async function dataScopesSummary(organizationId) {
  const policyVersion = await dataScopeRepository.getPolicyVersion(organizationId);
  const assignments = await dataScopeRepository.listAssignments({ organizationId });
  return { policyVersion, items: assignments.map((assignment) => ({ id: assignment.id, principalId: assignment.logtoUserId || assignment.logtoRoleId, roleId: assignment.logtoRoleId || null, capability: assignment.capability, action: assignment.action || "read", scopeType: assignment.scopeKind, taxonomyIds: assignment.dimensionValueId ? [assignment.dimensionValueId] : [], unitIds: assignment.unitId ? [assignment.unitId] : [], resourceSummary: assignment.resourceRef || assignment.dimensionValueId || assignment.unitId || assignment.scopeKind, effective: isEffectiveAssignment(assignment), source: assignment.sourceType || "explicit", reason: assignment.status === "active" ? "active" : assignment.status, unresolvedReason: assignment.status === "active" ? null : assignment.status, sourceVersion: String(policyVersion) })) };
}

async function buildStructureGovernanceSlice(organizationId) {
  const [taxonomy, units, dataScopes] = await Promise.all([taxonomySummary(organizationId), unitsSummary(organizationId), dataScopesSummary(organizationId)]);
  return { taxonomy, units, dataScopes, auditEvents: await auditPort.list({ organizationId, limit: 25 }), outboxEvents: await outboxPort.list({ organizationId, limit: 25 }) };
}

async function createTaxonomyValue({ organizationId, body, actorLogtoUserId }) { return taxonomyService().createValue({ organizationId, actorLogtoUserId, ...body }); }
async function publishTaxonomy({ organizationId, body, actorLogtoUserId }) { return taxonomyPublicationService().publish({ organizationId, actorLogtoUserId, expectedTaxonomyCatalogVersion: body?.expectedTaxonomyCatalogVersion }); }
async function createUnit({ organizationId, body, actorLogtoUserId }) { return unitService().createUnit({ organizationId, actorLogtoUserId, ...body }); }
async function activateUnit({ organizationId, unitId, actorLogtoUserId }) { return unitService().activateUnit({ organizationId, unitId, actorLogtoUserId }); }
async function createDataScope({ organizationId, body, actorLogtoUserId }) {
  const targetCount = [body?.dimensionValueId, body?.unitId, body?.resourceRef].filter(Boolean).length;
  if (targetCount !== 1) { const error = new Error("data_scope_exactly_one_target_required"); error.code = "data_scope_exactly_one_target_required"; error.status = 400; throw error; }
  return dataScopeService().createAssignment({ organizationId, actorLogtoUserId, ...body });
}

return { buildStructureGovernanceSlice, createTaxonomyValue, publishTaxonomy, createUnit, activateUnit, createDataScope };
}

module.exports = { createGovernanceStructureReadModel, safeActor };
