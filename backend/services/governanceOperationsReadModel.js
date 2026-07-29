"use strict";

const { hashSubject, redact } = require("../authorization/diagnostics");

const GOVERNANCE_OPERATIONS_CONTRACT_VERSION = "2026-07-civitas10-governance-operations-v1";
const REGISTERED_SCREENS = Object.freeze(new Map([
  ["owner-governance", Object.freeze({ screenId: "owner-governance", canonicalLabel: "Owner Governance Studio", surface: "owner", locked: true, hideable: false, routeId: "owner.organizations.governance" })],
  ["tenant-governance", Object.freeze({ screenId: "tenant-governance", canonicalLabel: "Tenant Governance Studio", surface: "tenant", locked: true, hideable: false, routeId: "tenant.settings.governance" })],
  ["tenant-documents", Object.freeze({ screenId: "tenant-documents", canonicalLabel: "Documents", surface: "tenant", locked: false, hideable: true, routeId: "tenant.documents" })],
]));

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

async function previewAccess({ organizationId, surface, body = {}, actorLogtoUserId, principal = {}, explainabilityQuery }) {
  assertPreviewRateLimit({ organizationId, actorLogtoUserId });
  if (body.previewOnly !== true) { const error = new Error("access_preview_requires_preview_only"); error.status = 400; error.code = "access_preview_requires_preview_only"; throw error; }
  if (!explainabilityQuery) { const error = new Error("authorization_explainability_query_unavailable"); error.status = 503; error.code = "authorization_explainability_query_unavailable"; throw error; }
  const response = await explainabilityQuery.execute({ organizationId, surface, subjectId: body.subjectId, permission: body.permission || body.actionId, resourceRef: body.resourceRef, decisionId: body.decisionId });
  audit({ organizationId, actorLogtoUserId, action: "governance.authorization_explanation.queried", targetType: "authorization_decision", targetId: response.decisionId, result: response.summary.allowed ? "allowed" : "denied", reason: response.summary.firstDecisiveReason });
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
