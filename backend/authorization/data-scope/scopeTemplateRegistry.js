"use strict";

const { DATA_SCOPE_STRATEGIES } = require("./dataScopeRegistry");
const { DATA_SCOPE_STRATEGY_REGISTRY, DATA_SCOPE_STRATEGY_VERSION } = require("./dataScopeStrategyRegistry");
const { TAXONOMY_DIMENSIONS, DATA_SCOPE_DIMENSION_REGISTRY_VERSION, DATA_SCOPE_DIMENSION_REGISTRY_HASH } = require("./taxonomyDimensionsRegistry");
const { DATA_SCOPE_REASON_CODES, dataScopeError } = require("./dataScopeReasonCodes");
const crypto = require("crypto");

const OWNER_SCOPE_TEMPLATE_VERSION = "2026-07-owner-scope-templates-v2";

const OWNER_SCOPE_TEMPLATES = Object.freeze(Object.entries(DATA_SCOPE_STRATEGIES).flatMap(([roleKey, capabilities]) =>
  Object.entries(capabilities).map(([capability, strategy]) => Object.freeze({
    id: roleKey === "organization_teacher" && capability === "lms" ? "teacher_lms_restricted_v2" : `${capability}.${roleKey}.${strategy.name || strategy.strategy}`,
    templateId: roleKey === "organization_teacher" && capability === "lms" ? "teacher_lms_restricted_v2" : `${capability}.${roleKey}.${strategy.name || strategy.strategy}`,
    version: OWNER_SCOPE_TEMPLATE_VERSION,
    capability,
    capabilities: Object.freeze([capability]),
    strategy: strategy.name || strategy.strategy,
    strategyId: strategy.name || strategy.strategy,
    allowedTargetKinds: Object.freeze((strategy.name || strategy.strategy) === "organization_and_units" || strategy.strategy === "dimensions" ? ["dimension"] : strategy.resolverKind === "relationship" || ["relationships", "group_leadership"].includes(strategy.strategy) ? [...((strategy.acceptedDimensionKeys || []).length ? ["dimension"] : []), "unit", "resource"] : []),
    allowedDimensionKeys: Object.freeze(strategy.acceptedDimensionKeys || strategy.requiredDimensionKeys || []),
    allowedRelationshipKeys: Object.freeze(strategy.relationshipKeys || []),
    allowedRoleKeys: Object.freeze([roleKey]),
    roleIds: Object.freeze([roleKey]),
    surface: "organization",
    requiredAssignment: strategy.name !== "organization" && strategy.name !== "self",
    allowOrganizationWide: strategy.name === "organization",
    allowTenantOverride: false,
    lifecycle: "published",
    dataScopeSemanticsVersion: strategy.version || strategy.contractVersion || "2026-07-data-scope-v1",
  }))
));

function assertScopeTemplateContracts(templates = OWNER_SCOPE_TEMPLATES) {
  for (const template of templates) {
    if (!DATA_SCOPE_STRATEGY_REGISTRY[template.strategyId]) throw dataScopeError(DATA_SCOPE_REASON_CODES.STRATEGY_UNKNOWN);
    if (template.allowedDimensionKeys.some((key) => !TAXONOMY_DIMENSIONS[key])) throw dataScopeError(DATA_SCOPE_REASON_CODES.DIMENSION_UNKNOWN);
    if (template.surface !== "organization" || template.allowTenantOverride !== false) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_MISMATCH);
  }
  return true;
}

const OWNER_SCOPE_TEMPLATE_REGISTRY_HASH = crypto.createHash("sha256").update(JSON.stringify(OWNER_SCOPE_TEMPLATES)).digest("hex");
const SCOPE_REGISTRY_COMPATIBILITY = Object.freeze({ dimensionRegistryVersion: DATA_SCOPE_DIMENSION_REGISTRY_VERSION, dimensionRegistryHash: DATA_SCOPE_DIMENSION_REGISTRY_HASH, strategyRegistryVersion: DATA_SCOPE_STRATEGY_VERSION, strategyRegistryHash: require("./dataScopeStrategyRegistry").DATA_SCOPE_STRATEGY_REGISTRY_HASH, templateRegistryVersion: OWNER_SCOPE_TEMPLATE_VERSION, templateRegistryHash: OWNER_SCOPE_TEMPLATE_REGISTRY_HASH });

function templateKey({ organizationId, scopeTemplateId, scopeTemplateVersion }) {
  return `${organizationId}:${scopeTemplateId}:${scopeTemplateVersion}`;
}

function createOwnerScopeTemplateRegistry({ templates = OWNER_SCOPE_TEMPLATES, availability = new Map(), tenantConfigurations = new Map() } = {}) {
  const byIdVersion = new Map(templates.map((template) => [`${template.id}:${template.version}`, template]));
  return {
    listPublishedTemplates() { return templates.filter((template) => template.lifecycle === "published"); },
    getTemplate({ scopeTemplateId, scopeTemplateVersion }) { return byIdVersion.get(`${scopeTemplateId}:${scopeTemplateVersion}`) || null; },
    isAvailable({ organizationId, scopeTemplateId, scopeTemplateVersion }) {
      return availability.get(templateKey({ organizationId, scopeTemplateId, scopeTemplateVersion })) === true;
    },
    getTenantConfiguration({ organizationId, scopeTemplateId, scopeTemplateVersion }) {
      return tenantConfigurations.get(templateKey({ organizationId, scopeTemplateId, scopeTemplateVersion })) || null;
    },
  };
}

function assertAssignmentMatchesTemplate({ assignment, template, organizationId, templateRegistry }) {
  if (!template) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_UNKNOWN);
  if (template.lifecycle !== "published") throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_NOT_PUBLISHED);
  if (templateRegistry) {
    const lookup = { organizationId, scopeTemplateId: template.id, scopeTemplateVersion: template.version };
    if (!templateRegistry.isAvailable(lookup)) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_NOT_AVAILABLE);
    const config = templateRegistry.getTenantConfiguration?.(lookup);
    if (!config) throw dataScopeError(DATA_SCOPE_REASON_CODES.TENANT_TEMPLATE_CONFIG_MISSING);
    if (config.enabled !== true) throw dataScopeError(DATA_SCOPE_REASON_CODES.TENANT_TEMPLATE_CONFIG_DISABLED);
  }
  if (assignment.capability !== template.capability) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_MISMATCH);
  if (!assignment.strategyId || assignment.strategyId !== template.strategyId) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_MISMATCH);
  if (!template.allowedTargetKinds.includes(assignment.scopeKind)) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_TARGET_FORBIDDEN);
  if (assignment.dimensionKey && !template.allowedDimensionKeys.includes(assignment.dimensionKey)) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_TARGET_FORBIDDEN);
  if (assignment.relationshipKey && !template.allowedRelationshipKeys.includes(assignment.relationshipKey)) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_TARGET_FORBIDDEN);
  if (!assignment.canonicalRoleId || !template.allowedRoleKeys.includes(assignment.canonicalRoleId)) throw dataScopeError(DATA_SCOPE_REASON_CODES.TEMPLATE_ROLE_FORBIDDEN);
  return true;
}

module.exports = { OWNER_SCOPE_TEMPLATE_VERSION, OWNER_SCOPE_TEMPLATE_REGISTRY_HASH, OWNER_SCOPE_TEMPLATES, SCOPE_REGISTRY_COMPATIBILITY, createOwnerScopeTemplateRegistry, assertAssignmentMatchesTemplate, assertScopeTemplateContracts, templateKey };
