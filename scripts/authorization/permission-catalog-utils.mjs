import crypto from 'node:crypto'
import fs from 'node:fs'

export const CATALOG_PATH = 'contracts/authorization/civitas-permission-catalog.yaml'
export const SCHEMA_PATH = 'contracts/authorization/schemas/permission-catalog.schema.json'
export const PHASE3_NAMESPACES = Object.freeze(['owner','org','lms','planning','crm','marketing','community','payments','hr','scheduling','support','analytics','reports','platform'])
export const DATA_SCOPE_STRATEGY_NAMES = Object.freeze(['global_owner','organization','organization_and_units','self','self_or_organization','academic_relationship','teaching_assignments','planning_relationship','planning_editable','planning_owned','assigned_reviews','assigned_approvals','approved_plans','community_membership','community_moderation','hr_relationship','payroll_relationship','scheduling_relationship','support_relationship','communication_relationship'])
export const ORGANIZATION_ROLES = Object.freeze(['organization_admin','organization_director','organization_headdirector','organization_headteacher','organization_groupleader','organization_teacher','organization_student','organization_parent','organization_secretary','organization_accountant','organization_billing','organization_payroll','organization_member'])
const ENUMS = { surface: ['owner','organization','account','public','webhook'], targetStatus: ['planned','active','deprecated'], observedImplementation: ['active','declared_planned','absent','verification_required'], risk: ['standard','high','restricted','critical'], compatibility: ['none','alias','blocked','compatibility-only'], identityProvisioningStatus: ['provisioned','not_provisioned'], runtimeAvailability: ['available','unavailable'], catalogStatus: ['defined','planned','active','deprecated'] }
const PROVIDERS = /(?:moodle|matomo|mautic)/i
export function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((k)=>`${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`; return JSON.stringify(value) }
export function catalogHash(catalog) { return crypto.createHash('sha256').update(canonicalJson(catalog)).digest('hex') }
export function loadCatalog(path = CATALOG_PATH) { return JSON.parse(fs.readFileSync(path, 'utf8')) }
function requireArray(errors, owner, key) { if (!Array.isArray(owner[key])) errors.push(`${key} must be an array`) }
export function validateCatalog(catalog) {
  const errors = []
  for (const key of ['contractVersion','phase3Namespaces','organizationRoles','permissions','legacyDecisions','reconciliation','legacyBaselineObserved']) if (!(key in catalog)) errors.push(`missing ${key}`)
  requireArray(errors, catalog, 'phase3Namespaces'); requireArray(errors, catalog, 'organizationRoles'); requireArray(errors, catalog, 'permissions'); requireArray(errors, catalog, 'legacyDecisions'); requireArray(errors, catalog, 'legacyBaselineObserved')
  const namespaces = new Set(catalog.phase3Namespaces || [])
  if (PHASE3_NAMESPACES.some((ns) => !namespaces.has(ns)) || namespaces.size !== PHASE3_NAMESPACES.length) errors.push('phase3Namespaces must match the 14 Phase 3 namespaces')
  if (JSON.stringify(catalog.organizationRoles || []) !== JSON.stringify(ORGANIZATION_ROLES)) errors.push('organizationRoles must freeze the 13 Phase 3 roles')
  const seen = new Set()
  for (const permission of catalog.permissions || []) {
    const prefix = `permission ${permission.name || '<missing>'}`
    for (const key of ['name','namespace','capabilityId','surface','targetStatus','observedImplementation','dataScopeStrategy','risk','consumers','policyRequirements','screenActionIds']) if (!(key in permission)) errors.push(`${prefix} missing ${key}`)
    if (!/^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)?$/.test(permission.name || '')) errors.push(`${prefix} invalid permission ID`)
    if ((permission.name || '').includes('*')) errors.push(`${prefix} contains wildcard`)
    if (PROVIDERS.test(permission.name || '')) errors.push(`${prefix} contains provider name`)
    if (seen.has(permission.name)) errors.push(`${prefix} duplicate ID`); seen.add(permission.name)
    if (!namespaces.has(permission.namespace)) errors.push(`${prefix} unknown namespace`)
    if (!(permission.name || '').startsWith(`${permission.namespace}.`)) errors.push(`${prefix} namespace mismatch`)
    for (const [key, values] of Object.entries(ENUMS)) if (permission[key] && !values.includes(permission[key])) errors.push(`${prefix} invalid ${key}`)
    for (const key of ['consumers','policyRequirements','screenActionIds']) if (!Array.isArray(permission[key])) errors.push(`${prefix} ${key} must be an array`)
    if (permission.surface === 'owner' && permission.namespace !== 'owner') errors.push(`${prefix} owner surface mismatch`)
    if (permission.namespace === 'owner' && permission.surface !== 'owner') errors.push(`${prefix} owner namespace must use owner surface`)
    if (permission.identityProvisioningStatus === 'provisioned' && !permission.presentation) errors.push(`${prefix} provisioned entries require presentation metadata`)
    if (permission.catalogStatus === 'active') {
      const presentation = permission.presentation || {}
      for (const key of ['label','description','groupKey','groupLabel','groupOrder','order']) if (presentation[key] === undefined || presentation[key] === '') errors.push(`${prefix} active entries require presentation.${key}`)
      if (!Number.isInteger(presentation.groupOrder) || !Number.isInteger(presentation.order)) errors.push(`${prefix} presentation order values must be integers`)
      if (/endpoint|migration|execute the |calls the |owning operation/i.test(presentation.description || '')) errors.push(`${prefix} presentation description must describe a user capability`)
    }
    if (!DATA_SCOPE_STRATEGY_NAMES.includes(permission.dataScopeStrategy)) errors.push(`${prefix} unknown dataScopeStrategy`)
    if (permission.namespace === 'planning' && permission.targetStatus !== 'planned') errors.push(`${prefix} planning permissions must remain planned`)
    if (permission.targetStatus === 'deprecated' && (!permission.replacement || !permission.compatibility || permission.compatibility === 'none' || !permission.migrationWindow || !permission.rollbackId)) errors.push(`${prefix} deprecated entries require replacement, compatibility window, migration window and rollback`)
  }
  const legacy = new Set()
  for (const decision of catalog.legacyDecisions || []) {
    if (legacy.has(decision.legacyId)) errors.push(`legacy ${decision.legacyId} duplicate decision`); legacy.add(decision.legacyId)
    if (!['rename','compatibility-only','blocked'].includes(decision.decision)) errors.push(`legacy ${decision.legacyId} invalid decision`)
    for (const key of ['legacyId','decision','owner','surface','targetStatus','compatibilityWindow','rollbackId','consumerEvidence','reason']) if (!(key in decision)) errors.push(`legacy ${decision.legacyId} missing ${key}`)
    if (!Array.isArray(decision.consumerEvidence) || decision.consumerEvidence.length === 0) errors.push(`legacy ${decision.legacyId} consumerEvidence required`)
    if (decision.decision === 'blocked' && !decision.blocker) errors.push(`legacy ${decision.legacyId} blocked decisions require blocker`)
  }
  if ((catalog.permissions || []).length !== 167) errors.push('catalog must contain exactly 167 target permissions')
  if ((catalog.legacyDecisions || []).length !== 10) errors.push('catalog must contain exactly 10 legacy decisions')
  const reconciliation = catalog.reconciliation || {}
  for (const key of ['baseRef','baseSha','catalogSourceSha','mergeBase','catalogHashAlgorithm','roleModelVersion','contractVersion']) if (!reconciliation[key]) errors.push(`reconciliation missing ${key}`)
  const requiredLegacy = new Map([['billing.seats.read','payments.seats.read'],['billing.seats.assign','payments.seats.assign'],['billing.seats.release','payments.seats.release'],['billing.payments.read','payments.payments.read'],['billing.payments.write','payments.payments.write'],['billing.payments.manage','payments.payments.manage'],['owner.read','owner.profile.read'],['owner.write','owner.runtime.operations.execute'],['owner.system.read','owner.runtime.read'],['account.profile.read',null],['governance.owner.read',null],['governance.tenant.read',null],['governance.preview.read',null]])
  const observed = new Map((catalog.legacyBaselineObserved || []).map((decision) => [decision.legacyId, decision]))
  for (const [legacyId, canonicalName] of requiredLegacy) {
    const decision = observed.get(legacyId)
    if (!decision) errors.push(`legacy baseline ${legacyId} missing explicit classification`)
    else {
      if (canonicalName && decision.canonicalName !== canonicalName) errors.push(`legacy baseline ${legacyId} must map to ${canonicalName}`)
      if (!canonicalName && !['blocked','not-incorporated'].includes(decision.classification)) errors.push(`legacy baseline ${legacyId} must be blocked or not-incorporated`)
      for (const key of ['owner','surface','targetStatus','compatibilityWindow','rollbackId','consumerEvidence']) if (!(key in decision)) errors.push(`legacy baseline ${legacyId} missing ${key}`)
      if (!Array.isArray(decision.consumerEvidence)) errors.push(`legacy baseline ${legacyId} consumerEvidence must be an array`)
    }
  }
  if ((catalog.legacyBaselineObserved || []).length !== 13) errors.push('observed legacy baseline must classify exactly 13 IDs')
  return { valid: errors.length === 0, errors }
}
