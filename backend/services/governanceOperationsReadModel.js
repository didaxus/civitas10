"use strict";

const { explainAuthorization, hashSubject } = require("../authorization/diagnostics");
const { governanceAuditRepository } = require("./governanceAuditRepository");

const GOVERNANCE_OPERATIONS_CONTRACT_VERSION = "2026-07-civitas10-governance-operations-v1";
const REGISTERED_SCREENS = Object.freeze(new Map([
  ["owner-governance", Object.freeze({ screenId: "owner-governance", canonicalLabel: "Owner Governance Studio", surface: "owner", locked: true, hideable: false, routeId: "owner.organizations.governance" })],
  ["tenant-governance", Object.freeze({ screenId: "tenant-governance", canonicalLabel: "Tenant Governance Studio", surface: "tenant", locked: true, hideable: false, routeId: "tenant.settings.governance" })],
  ["tenant-documents", Object.freeze({ screenId: "tenant-documents", canonicalLabel: "Documents", surface: "tenant", locked: false, hideable: true, routeId: "tenant.documents" })],
]));
const REGISTERED_ACTIONS = Object.freeze(new Set(["governance.access.preview", "documents.read", "documents.create", "owner.organizations.read"]));

const navigationPolicies = new Map();
const rateLimitBuckets = new Map();

function nowIso() { return new Date().toISOString(); }
function actorId(req) { return req?.user?.sub || req?.user?.id || "system"; }
function policyKey(organizationId) { return String(organizationId || ""); }

function audit({ organizationId, actorLogtoUserId, action, targetType = "governance", targetId = null, result = "success", reason = "recorded", before, after, decisionId = null, decisionSnapshot = null, sourceVersions = {}, correlationId = null, causationId = null }) {
  return governanceAuditRepository.tenant(organizationId).append({ actorId: actorLogtoUserId, operation: action, targetType, targetId, outcome: result, reasonCode: reason, before, after, decisionId, decisionSnapshot, sourceVersions, correlationId, causationId });
}

function defaultPolicy(organizationId) {
  return {
    organizationId,
    aliasesTenantEditable: false,
    navigationTenantEditable: true,
    aliases: [
      { roleId: "organization_admin", canonicalKey: "organization_admin", displayName: "Organization admin", editableBy: "owner" },
      { roleId: "organization_member", canonicalKey: "organization_member", displayName: "Organization member", editableBy: "owner" },
    ],
    visualPreferences: [...REGISTERED_SCREENS.values()].map((screen, index) => ({ screenId: screen.screenId, canonicalLabel: screen.canonicalLabel, routeId: screen.routeId, hidden: false, order: (index + 1) * 10, locked: screen.locked, hideable: screen.hideable, authorizationEffect: "presentation_only" })),
    version: "1",
    updatedAt: nowIso(),
  };
}

function getPolicy(organizationId) {
  const key = policyKey(organizationId);
  if (!navigationPolicies.has(key)) navigationPolicies.set(key, defaultPolicy(organizationId));
  return navigationPolicies.get(key);
}

function buildAliasesNavigationPolicy(organizationId) {
  return getPolicy(organizationId);
}

function assertRegisteredPreference(preference) {
  const screenId = String(preference?.screenId || "");
  const registered = REGISTERED_SCREENS.get(screenId);
  if (!registered) { const error = new Error("navigation_screen_unknown"); error.status = 400; error.code = "navigation_screen_unknown"; throw error; }
  if (registered.locked && preference.hidden === true) { const error = new Error("navigation_locked_item_cannot_be_hidden"); error.status = 400; error.code = "navigation_locked_item_cannot_be_hidden"; throw error; }
  return registered;
}

function updateNavigationPreferences({ organizationId, preferences = [], actorLogtoUserId, surface = "tenant" }) {
  const current = getPolicy(organizationId);
  if (surface === "tenant" && !current.navigationTenantEditable) { const error = new Error("navigation_preferences_owner_managed"); error.status = 403; error.code = "navigation_preferences_owner_managed"; throw error; }
  const before = current.visualPreferences;
  const existing = new Map(current.visualPreferences.map((preference) => [preference.screenId, preference]));
  for (const preference of preferences) {
    const registered = assertRegisteredPreference(preference);
    const previous = existing.get(registered.screenId) || { screenId: registered.screenId };
    existing.set(registered.screenId, { ...previous, screenId: registered.screenId, canonicalLabel: registered.canonicalLabel, routeId: registered.routeId, hidden: Boolean(preference.hidden), order: Number.isFinite(Number(preference.order)) ? Number(preference.order) : previous.order, locked: registered.locked, hideable: registered.hideable, authorizationEffect: "presentation_only" });
  }
  const version = String(Number(current.version || 0) + 1);
  const saved = { ...current, visualPreferences: [...existing.values()].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)), version, updatedAt: nowIso() };
  navigationPolicies.set(policyKey(organizationId), saved);
  audit({ organizationId, actorLogtoUserId, action: "governance.navigation_preferences.updated", targetType: "navigation_preferences", targetId: organizationId, reason: "presentation_only_no_authorization_change", before, after: saved.visualPreferences });
  return { contractVersion: GOVERNANCE_OPERATIONS_CONTRACT_VERSION, policy: saved };
}

function assertPreviewRateLimit({ organizationId, actorLogtoUserId }) {
  const minute = Math.floor(Date.now() / 60000);
  const key = `${organizationId}:${actorLogtoUserId || "system"}:${minute}`;
  const count = (rateLimitBuckets.get(key) || 0) + 1;
  rateLimitBuckets.set(key, count);
  if (count > 30) { const error = new Error("access_preview_rate_limited"); error.status = 429; error.code = "access_preview_rate_limited"; throw error; }
}

async function previewAccess({ organizationId, surface, body = {}, actorLogtoUserId, principal = {} }) {
  assertPreviewRateLimit({ organizationId, actorLogtoUserId });
  if (body.previewOnly !== true) { const error = new Error("access_preview_requires_preview_only"); error.status = 400; error.code = "access_preview_requires_preview_only"; throw error; }
  const subjectId = String(body.subjectId || "");
  const actionId = body.actionId ? String(body.actionId) : undefined;
  const screenId = body.screenId ? String(body.screenId) : undefined;
  if (!subjectId || (!actionId && !screenId)) { const error = new Error("access_preview_subject_and_target_required"); error.status = 400; error.code = "access_preview_subject_and_target_required"; throw error; }
  if (actionId && !REGISTERED_ACTIONS.has(actionId)) { const error = new Error("access_preview_action_unknown"); error.status = 400; error.code = "access_preview_action_unknown"; throw error; }
  const screen = screenId ? REGISTERED_SCREENS.get(screenId) : null;
  if (screenId && !screen) { const error = new Error("access_preview_screen_unknown"); error.status = 400; error.code = "access_preview_screen_unknown"; throw error; }
  const policy = getPolicy(organizationId);
  const preference = screenId ? policy.visualPreferences.find((item) => item.screenId === screenId) : null;
  const allowed = Boolean(subjectId) && (!screen || screen.surface === surface || surface === "owner");
  const reason = allowed ? (preference?.hidden ? "visual_preference_hidden_not_authorization" : "allowed") : "surface_mismatch";
  const diagnostics = await explainAuthorization({
    surface: surface === "tenant" ? "organization" : "owner",
    organizationId,
    principal: { subject: subjectId, organizationId: surface === "tenant" ? organizationId : principal.organizationId, scopes: [actionId || "governance.preview.read"], tokenType: surface === "tenant" ? "organization" : "global" },
    permission: actionId || "governance.preview.read",
    decision: { allowed, reasonCode: reason, policyVersion: policy.version, evaluatedRolePaths: allowed ? ["preview"] : [] },
    diagnosticPermissionGranted: true,
    visual: { screen, action: actionId ? { actionId } : null, visualPreference: preference },
    runtime: { policyVersion: policy.version, visualVersion: policy.version, readModelVersion: GOVERNANCE_OPERATIONS_CONTRACT_VERSION },
    provenance: { entitlement: { permission: actionId || screenId, ownerCeiling: "preview", tenantActivation: "preview", reasonCodes: [reason] }, governance: { readModelVersion: GOVERNANCE_OPERATIONS_CONTRACT_VERSION, policyConfigVersion: policy.version } },
  });
  const response = { contractVersion: GOVERNANCE_OPERATIONS_CONTRACT_VERSION, generatedAt: nowIso(), organizationId, surface, subjectId: hashSubject(subjectId), actionId, screenId, decision: { allowed, reason, sourceVersions: { policyVersion: policy.version, visualVersion: policy.version, readModelVersion: GOVERNANCE_OPERATIONS_CONTRACT_VERSION } }, provenance: diagnostics.provenance, diagnostics, mutated: false };
  audit({ organizationId, actorLogtoUserId, action: "governance.access_preview.simulated", targetType: actionId ? "action" : "screen", targetId: actionId || screenId, result: allowed ? "allowed" : "denied", reason, after: response });
  return response;
}

function auditProjection(event) {
  return { ...event, id: event.eventId, action: event.operation, actorId: event.actor === "system" ? "system" : `sub_${event.actor.split(":").at(-1)}`, targetType: event.target.type, targetId: event.target.opaqueId, result: event.outcome, reason: event.reasonCode, before: event.change.before, after: event.change.after, contractVersion: GOVERNANCE_OPERATIONS_CONTRACT_VERSION, createdAt: event.recordedAt };
}
function listGovernanceAuditPage({ organizationId, ...query } = {}) {
  if (!organizationId) throw new TypeError("organizationId is required");
  const page = governanceAuditRepository.tenant(organizationId).list(query);
  return { ...page, events: page.events.map(auditProjection) };
}
function listGovernanceAuditEvents(input = {}) { return listGovernanceAuditPage(input).events; }
function getGovernanceAuditEvent({ organizationId, eventId }) { return governanceAuditRepository.tenant(organizationId).detail(eventId); }
function exportGovernanceAuditEvents({ organizationId, ...input }) { return governanceAuditRepository.tenant(organizationId).export(input); }

module.exports = { GOVERNANCE_OPERATIONS_CONTRACT_VERSION, buildAliasesNavigationPolicy, updateNavigationPreferences, previewAccess, listGovernanceAuditEvents, listGovernanceAuditPage, getGovernanceAuditEvent, exportGovernanceAuditEvents, audit, actorId };
