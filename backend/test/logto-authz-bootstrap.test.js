'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadCanonicalAuthorizationContract } = require('../../scripts/logto/canonical-contract-loader')
const { validateLocalAuthorizationContract } = require('../../scripts/logto/authorization-validator')
const { emptyRemoteState, normalizeRemoteState } = require('../../scripts/logto/authorization-state-reader')
const { buildAuthorizationPlan } = require('../../scripts/logto/authorization-planner')
const { main: logtoAuthzMain } = require('../../scripts/logto/cli')
const { applyAuthorizationPlan } = require('../../scripts/logto/authorization-applier')
const { createLogtoManagementApiClient } = require('../../scripts/logto/management-api-client')
const { loadLogtoBootstrapConfig } = require('../../scripts/logto/config')
const { redact } = require('../../scripts/logto/redaction')
const { buildCustomClaimsPlan, validateCustomClaimsPlan } = require('../../scripts/logto/bootstrap-custom-token-claims')

test('contract loader imports #74/#93 and validates local invariants', () => {
  const contract = loadCanonicalAuthorizationContract()
  const result = validateLocalAuthorizationContract(contract)
  assert.equal(result.valid, true, result.errors.join('\n'))
  assert.equal(contract.manifest.resource, 'https://civitas.didaxus.com/api')
  assert.ok(contract.contractHash)
})

test('preflight rejects exact dangerous fixtures', () => {
  const fixtures = [
    ['owner_global', 'org.audit.logs.read'], ['owner_global', 'analytics.reports.read'], ['owner_global', 'billing.invoices.read'], ['owner_global', 'lms.grades.read'], ['organization_admin', 'owner.platform.settings.write'], ['organization_admin', 'org.impersonate'], ['organization_headdirector', 'org.impersonate'], ['organization_accountant', 'billing.seats.request_modify'], ['organization_admin', 'billing.seats.request_modify'], ['organization_admin', 'lms.*'], ['organization_admin', 'org.*'], ['organization_admin', 'impersonation:write'], ['organization_admin', 'read'], ['organization_admin', 'owner:read'], ['organization_admin', 'organization.members.write'],
  ]
  for (const [role, permission] of fixtures) {
    const contract = JSON.parse(JSON.stringify(loadCanonicalAuthorizationContract()))
    contract.manifest.permissions.push({ name: permission, description: permission, domain: permission.split('.')[0] || 'legacy', surface: role === 'owner_global' ? 'global' : 'organization', status: 'active', resource: contract.manifest.resource, consumers: ['fixture'], policyRequirements: [], overlayMode: 'not-applicable' })
    contract.manifest.rolePermissionAssignments[role].push(permission)
    const result = validateLocalAuthorizationContract(contract)
    assert.equal(result.valid, false, `${role} -> ${permission}`)
  }
})

test('planner creates deterministic empty-state plan and no deletes', () => {
  const contract = loadCanonicalAuthorizationContract()
  const first = buildAuthorizationPlan({ contract, remoteState: emptyRemoteState(), targetEnvironment: 'test' })
  const second = buildAuthorizationPlan({ contract, remoteState: emptyRemoteState(), targetEnvironment: 'test' })
  assert.deepEqual(first, second)
  assert.equal(first.destructiveOperations.length, 0)
  assert.ok(first.resource.operations.some((op) => op.type === 'create-resource'))
  assert.ok(first.permissions.create.every((op) => !op.payload.name.includes('*')))
})

test('planner detects synchronized, metadata drift, assignment drift, unmanaged, and conflicts', () => {
  const contract = loadCanonicalAuthorizationContract()
  const provisioned = contract.manifest.permissions.filter((p) => p.status === 'active' || p.identityProvisioning === 'provisionable')
  const synced = normalizeRemoteState({ resource: { id: 'res1', indicator: contract.manifest.resource }, permissions: provisioned.map((p) => ({ id: `scope_${p.name}`, name: p.name, description: p.description })), globalRoles: [{ id: 'role_owner', name: 'owner_global', permissions: contract.manifest.rolePermissionAssignments.owner_global }], organizationRoles: contract.manifest.organizationRoles.map((name) => ({ id: `role_${name}`, name, permissions: contract.manifest.rolePermissionAssignments[name] || [] })) })
  const plan = buildAuthorizationPlan({ contract, remoteState: synced })
  assert.equal(plan.permissions.create.length, 0)
  assert.ok(plan.permissions.noop.length > 0)
  const drift = normalizeRemoteState({ ...synced, permissions: [{ id: 'scope_org.documents.read', name: 'org.documents.read', description: 'old' }, { id: 'unmanaged', name: 'legacy.scope.read', description: 'legacy' }], globalRoles: [{ id: 'role_owner', name: 'owner_global', permissions: [] }, { id: 'role_other', name: 'other', permissions: [] }], organizationRoles: [{ id: 'role_admin', name: 'organization_admin', permissions: [] }, { id: 'role_bad', name: 'organization_admin_shadow', permissions: [] }] })
  const driftPlan = buildAuthorizationPlan({ contract, remoteState: drift })
  assert.ok(driftPlan.permissions.update.some((op) => op.targetId === 'org.documents.read'))
  assert.ok(driftPlan.permissions.unmanaged.some((p) => p.name === 'legacy.scope.read'))
  assert.ok(driftPlan.globalRoles.updateAssignments.some((op) => op.targetId === 'owner_global'))
  assert.ok(driftPlan.organizationRoles.conflicts.some((r) => r.name === 'organization_admin_shadow'))
})

test('applier blocks unapproved/stale plans and is idempotent for noop plans', async () => {
  const contract = loadCanonicalAuthorizationContract()
  const remoteState = emptyRemoteState()
  const plan = buildAuthorizationPlan({ contract, remoteState })
  await assert.rejects(() => applyAuthorizationPlan({ plan, contract, remoteState, client: fakeClient(), approved: false, preflightOk: true, actor: 'tester', reason: 'contract', expectedPlanHash: plan.planHash, idempotencyKey: 'idem-1' }), /explicit approval/)
  const stale = { ...plan, contractHash: 'stale' }
  await assert.rejects(() => applyAuthorizationPlan({ plan: stale, contract, remoteState, client: fakeClient(), approved: true, preflightOk: true, actor: 'tester', reason: 'contract', expectedPlanHash: plan.planHash, idempotencyKey: 'idem-2' }), /contract hash/)
  const tampered = { ...plan, permissions: { ...plan.permissions, create: [] } }
  await assert.rejects(() => applyAuthorizationPlan({ plan: tampered, contract, remoteState, client: fakeClient(), approved: true, preflightOk: true, actor: 'tester', reason: 'contract', expectedPlanHash: 'wrong', idempotencyKey: 'idem-3' }), /expected plan hash/)
  await assert.rejects(() => applyAuthorizationPlan({ plan: tampered, contract, remoteState, client: fakeClient(), approved: true, preflightOk: true, actor: 'tester', reason: 'contract', expectedPlanHash: tampered.planHash, idempotencyKey: 'idem-4' }), /plan hash does not match/)
  const provisioned = contract.manifest.permissions.filter((permission) => permission.status === 'active' || permission.identityProvisioning === 'provisionable')
  const syncedRemote = normalizeRemoteState({ resource: { id: 'res1', indicator: contract.manifest.resource }, permissions: provisioned.map((permission) => ({ id: `scope_${permission.name}`, name: permission.name, description: permission.description })), globalRoles: contract.manifest.globalRoles.map((name) => ({ id: `role_${name}`, name, permissions: contract.manifest.rolePermissionAssignments[name] || [] })), organizationRoles: contract.manifest.organizationRoles.map((name) => ({ id: `org_role_${name}`, name, permissions: contract.manifest.rolePermissionAssignments[name] || [] })) })
  const noop = buildAuthorizationPlan({ contract, remoteState: syncedRemote })
  const result = await applyAuthorizationPlan({ plan: noop, contract, remoteState: syncedRemote, client: fakeClient(), approved: true, preflightOk: true, actor: 'tester', reason: 'contract', expectedPlanHash: noop.planHash, idempotencyKey: 'idem-5' })
  assert.equal(result.results[0].status, 'noop')
})

test('applier records partial execution and rerun can continue with a new plan', async () => {
  const contract = loadCanonicalAuthorizationContract()
  const remoteState = emptyRemoteState()
  const plan = buildAuthorizationPlan({ contract, remoteState })
  let calls = 0
  const client = { requestJson: async () => { calls += 1; if (calls === 2) { const e = new Error('boom'); e.code = 'BOOM'; throw e } return { id: 'res1' } } }
  const result = await applyAuthorizationPlan({ plan, contract, remoteState, client, approved: true, preflightOk: true, actor: 'tester', reason: 'contract', expectedPlanHash: plan.planHash, idempotencyKey: 'idem-partial', logger: { error() {} } })
  assert.ok(result.results.some((r) => r.status === 'failed'))
})



test('plan mode is default read-only and write-spy stays clean when credentials are present', async () => {
  const writes = []
  const client = { requestJson: async (method, url) => { if (!['GET'].includes(method)) writes.push({ method, url }); return url === '/api/resources' ? [] : [] } }
  const out = require('node:path').join(require('node:os').tmpdir(), `logto-plan-${Date.now()}.json`)
  const result = await logtoAuthzMain(['plan-rbac', out], { LOGTO_ENDPOINT: 'https://auth.example.test', LOGTO_MANAGEMENT_API_RESOURCE: 'https://auth.example.test/api', LOGTO_CIVITAS_API_RESOURCE: 'https://civitas.didaxus.com/api' }, { client })
  assert.equal(writes.length, 0)
  assert.equal(result.mode, 'plan-rbac')
  const plan = JSON.parse(require('node:fs').readFileSync(out, 'utf8'))
  assert.equal(plan.targetIdentifier, 'https://civitas.didaxus.com/api')
  assert.equal(plan.catalogHash, loadCanonicalAuthorizationContract().manifest.catalogHash)
  assert.equal(plan.remoteStateStatus, 'verified')
  assert.ok(plan.provenance.roleModelVersion)
})

test('plan without credentials marks remote state verification_required and never asserts real Logto state', () => {
  const contract = loadCanonicalAuthorizationContract()
  const plan = buildAuthorizationPlan({ contract, remoteState: emptyRemoteState({ source: 'empty-no-credentials' }) })
  assert.equal(plan.remoteStateStatus, 'verification_required')
  assert.equal(plan.targetIdentifier, 'https://civitas.didaxus.com/api')
})

test('drift report distinguishes legacy, planned leakage, wrong surface, extra, missing and wrong resource indicator', () => {
  const contract = loadCanonicalAuthorizationContract()
  const remoteState = normalizeRemoteState({
    resource: { id: 'res-wrong', indicator: 'https://wrong.example.test/api' },
    permissions: [
      { id: 'legacy', name: 'governance.preview.read', description: 'legacy' },
      { id: 'planned', name: 'owner.audit.read', description: 'planned leak' },
      { id: 'extra', name: 'crm.unknown.read', description: 'extra' },
    ],
    organizationRoles: [{ id: 'org-admin', name: 'organization_admin', permissions: ['owner.runtime.read'] }],
  })
  const plan = buildAuthorizationPlan({ contract, remoteState })
  assert.ok(plan.drift.wrongResourceIndicator.length > 0)
  assert.ok(plan.drift.legacy.some((item) => item.name === 'governance.preview.read'))
  assert.ok(plan.drift.plannedLeakage.some((item) => item.name === 'owner.audit.read'))
  assert.equal(plan.drift.plannedLeakage.some((item) => item.name === 'lms.grades.export'), false)
  assert.ok(plan.drift.extra.some((item) => item.name === 'crm.unknown.read'))
  assert.ok(plan.drift.wrongSurface.some((item) => item.permission === 'owner.runtime.read'))
  assert.ok(plan.drift.missing.some((item) => item.targetType === 'permission'))
})

test('management client redacts secrets, retries 429/5xx, honors no-retry 4xx, and caches token', async () => {
  const config = loadLogtoBootstrapConfig({ LOGTO_ENDPOINT: 'https://auth.example.test', LOGTO_MANAGEMENT_API_RESOURCE: 'https://auth.example.test/api', LOGTO_CIVITAS_API_RESOURCE: 'https://civitas.didaxus.com/api', LOGTO_M2M_APP_ID: 'app', LOGTO_M2M_APP_SECRET: 'secret', LOGTO_BOOTSTRAP_MAX_RETRIES: '2', LOGTO_BOOTSTRAP_TIMEOUT_MS: '50' }, { requireCredentials: true })
  const calls = []
  const transport = async (url, init) => { calls.push({ url, init }); if (url.endsWith('/oidc/token')) return response(200, { access_token: 'token-secret', expires_in: 3600 }); if (calls.filter((c)=>c.url.includes('/api/resources')).length === 1) return response(429, { message: 'rate' }, { 'retry-after': '0' }); return response(200, { data: [] }) }
  const client = createLogtoManagementApiClient(config, { transport, sleepFn: async () => {} })
  await client.requestJson('GET', '/api/resources')
  await client.requestJson('GET', '/api/resources')
  assert.equal(calls.filter((c)=>c.url.endsWith('/oidc/token')).length, 1)
  assert.equal(redact({ accessToken: 'token-secret', clientSecret: 'secret' }).accessToken, '[REDACTED]')
  const badClient = createLogtoManagementApiClient(config, { transport: async (url) => url.endsWith('/oidc/token') ? response(200, { access_token: 't', expires_in: 1 }) : response(400, { error: 'bad' }), sleepFn: async () => {} })
  await assert.rejects(() => badClient.requestJson('GET', '/api/bad'), /failed/)
})

test('custom claims flow is separate and never expands scopes', () => {
  const plan = buildCustomClaimsPlan()
  assert.equal(plan.operations.length, 1)
  assert.equal(plan.claims.length, 3)
  assert.equal(validateCustomClaimsPlan(plan).valid, true)
  assert.equal(validateCustomClaimsPlan({ claims: ['https://civitas.didaxus.com/claims/effectivePermissions'] }).valid, false)
})

function fakeClient() { return { requestJson: async () => ({ id: 'ok' }) } }
function response(status, body, headers = {}) { return { ok: status >= 200 && status < 300, status, headers: { entries: () => Object.entries(headers) }, text: async () => JSON.stringify(body) } }
