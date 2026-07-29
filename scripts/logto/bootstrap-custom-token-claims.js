'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { canonicalJson } = require('./canonical-contract-loader')

const CLAIM_NAMESPACE = 'https://civitas.didaxus.com/claims/'
const MEMBERSHIP_CLAIM = `${CLAIM_NAMESPACE}organization_membership_id`
const ROLES_CLAIM = `${CLAIM_NAMESPACE}organization_role_ids`
const VERSION_CLAIM = `${CLAIM_NAMESPACE}authz_contract_version`
const AUTHZ_CONTRACT_VERSION = '2026-07-civitas-authz-v2'
const ALLOWED_CUSTOM_CLAIMS = Object.freeze([MEMBERSHIP_CLAIM, ROLES_CLAIM, VERSION_CLAIM])
const TEMPLATE_PATH = path.join(__dirname, 'templates/get-custom-jwt-claims.js')
const FORBIDDEN_CLAIM_RE = /(authorization_scope_assignments|dimensionValueIds|unitIds|resourceRefs|relationshipKeys|externalGroups|upstream|inventor|relationship.graph|pbac|ceiling|activation|tenantContext|delegationContext|secret|credential)/i

function scriptSource() { return fs.readFileSync(TEMPLATE_PATH, 'utf8') }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex') }
function planHash(plan) { return sha256(canonicalJson({ ...plan, planHash: undefined })) }

function validateCustomClaimsPlan(plan = {}) {
  const claims = plan.claims || []
  const missing = ALLOWED_CUSTOM_CLAIMS.filter((claim) => !claims.includes(claim))
  const extra = claims.filter((claim) => !ALLOWED_CUSTOM_CLAIMS.includes(claim))
  const forbidden = claims.filter((claim) => FORBIDDEN_CLAIM_RE.test(claim))
  const errors = []
  if (missing.length) errors.push('claims_missing')
  if (extra.length) errors.push('claims_extra')
  if (forbidden.length) errors.push('forbidden_claims')
  if (plan.authzContractVersion !== AUTHZ_CONTRACT_VERSION) errors.push('contract_version_mismatch')
  if (plan.resource !== 'https://civitas.didaxus.com/api') errors.push('application_resource_mismatch')
  if (plan.scriptHash !== sha256(scriptSource())) errors.push('custom_token_script_hash_mismatch')
  return { valid: errors.length === 0, errors, missing, extra, forbidden, allowedClaims: [...ALLOWED_CUSTOM_CLAIMS] }
}

function buildCustomClaimsPlan({ remoteScriptHash = null, targetEnvironment = 'unknown' } = {}) {
  const source = scriptSource()
  const desiredHash = sha256(source)
  const operation = remoteScriptHash === desiredHash ? [] : [{
    operationId: 'replace-custom-token-script:civitas-organization-access-token',
    type: 'replace-custom-token-script',
    targetType: 'custom-token-script',
    targetId: 'civitas-organization-access-token',
    desiredScriptHash: desiredHash,
  }]
  const plan = {
    schemaVersion: '2026-07-logto-custom-claims-plan-v2',
    generatedAt: '1970-01-01T00:00:00.000Z',
    targetEnvironment,
    resource: 'https://civitas.didaxus.com/api',
    authzContractVersion: AUTHZ_CONTRACT_VERSION,
    claims: [...ALLOWED_CUSTOM_CLAIMS],
    scriptPath: path.relative(process.cwd(), TEMPLATE_PATH),
    scriptHash: desiredHash,
    remoteScriptHash,
    operations: operation,
    rollback: { strategy: 'restore-by-hash', previousScriptHash: remoteScriptHash },
  }
  plan.planHash = planHash(plan)
  return plan
}

async function applyCustomClaimsPlan({ plan, client, approved, expectedPlanHash, actor, reason, idempotencyKey } = {}) {
  for (const [field, value] of Object.entries({ approved, expectedPlanHash, actor, reason, idempotencyKey })) {
    if (!value) throw new Error(`apply-custom-claims requires ${field}`)
  }
  if (expectedPlanHash !== plan.planHash || planHash(plan) !== plan.planHash) throw new Error('apply-custom-claims refused stale plan hash')
  const validation = validateCustomClaimsPlan(plan)
  if (!validation.valid) throw new Error(`invalid custom claims plan: ${validation.errors.join(',')}`)
  if (!client || typeof client.replaceCustomJwtScript !== 'function') throw new Error('Logto client does not support controlled custom JWT script apply')
  const results = []
  for (const operation of plan.operations) {
    await client.replaceCustomJwtScript({ source: scriptSource(), expectedCurrentHash: plan.remoteScriptHash, idempotencyKey })
    results.push({ operationId: operation.operationId, status: 'applied' })
  }
  if (!results.length) results.push({ operationId: 'noop', status: 'noop' })
  return { schemaVersion: '2026-07-logto-custom-claims-apply-v1', planHash: plan.planHash, actor, reason, idempotencyKey, results, rollback: plan.rollback }
}

module.exports = { ALLOWED_CUSTOM_CLAIMS, AUTHZ_CONTRACT_VERSION, MEMBERSHIP_CLAIM, ROLES_CLAIM, VERSION_CLAIM, TEMPLATE_PATH, applyCustomClaimsPlan, buildCustomClaimsPlan, planHash, scriptSource, sha256, validateCustomClaimsPlan }
