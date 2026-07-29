#!/usr/bin/env node
'use strict'
const fs = require('fs')
const path = require('path')
const { loadLogtoBootstrapConfig } = require('./config')
const { loadCanonicalAuthorizationContract } = require('./canonical-contract-loader')
const { assertValidLocalAuthorizationContract } = require('./authorization-validator')
const { emptyRemoteState, readAuthorizationState } = require('./authorization-state-reader')
const { buildAuthorizationPlan } = require('./authorization-planner')
const { applyAuthorizationPlan } = require('./authorization-applier')
const { applyCustomClaimsPlan, buildCustomClaimsPlan, validateCustomClaimsPlan } = require('./bootstrap-custom-token-claims')
const { createLogtoManagementApiClient } = require('./management-api-client')
const { redact } = require('./redaction')
function parseApplyOptions(argv, env) {
  const args = new Map()
  for (let i = 2; i < argv.length; i += 1) if (argv[i].startsWith('--')) args.set(argv[i].slice(2), argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true')
  return {
    approved: env.LOGTO_BOOTSTRAP_ALLOW_APPLY === 'true' || args.get('confirm') === 'true',
    actor: args.get('actor') || env.LOGTO_BOOTSTRAP_ACTOR,
    reason: args.get('reason') || env.LOGTO_BOOTSTRAP_REASON,
    expectedPlanHash: args.get('expected-plan-hash') || env.LOGTO_BOOTSTRAP_EXPECTED_PLAN_HASH,
    idempotencyKey: args.get('idempotency-key') || env.LOGTO_BOOTSTRAP_IDEMPOTENCY_KEY,
  }
}
async function main(argv = process.argv.slice(2), env = process.env, options = {}) {
  const mode = argv[0] || 'plan-rbac'
  const contract = loadCanonicalAuthorizationContract()
  const preflight = assertValidLocalAuthorizationContract(contract)
  if (mode === 'contract-check') return print({ mode, ok: true, contractHash: contract.contractHash, contractVersion: contract.manifest.contractVersion, catalogHash: contract.manifest.catalogHash, roleModelVersion: contract.manifest.roleModelVersion })
  if (mode.includes('custom-claims')) return handleCustomClaims(mode, argv, env, options)
  const config = loadLogtoBootstrapConfig(env, { requireCredentials: mode === 'apply-rbac' })
  const client = options.client || (config.hasCredentials ? createLogtoManagementApiClient(config, options.clientOptions) : null)
  const remoteState = client ? await readAuthorizationState(client, { resourceIndicator: contract.manifest.resource }) : emptyRemoteState({ source: 'empty-no-credentials' })
  const plan = buildAuthorizationPlan({ contract, remoteState, targetEnvironment: config.endpoint })
  if (mode === 'check-rbac') return print({ mode, ok: plan.permissions.conflicts.length === 0 && plan.drift.wrongSurface.length === 0 && plan.drift.plannedLeakage.length === 0, remoteState: remoteState.source, remoteStateStatus: plan.remoteStateStatus, summary: require('./drift-report').summarizePlan(plan), warning: config.hasCredentials ? null : 'No M2M credentials; remote state marked verification_required; no Logto writes attempted.' })
  if (mode === 'plan-rbac') { const out = argv[1] || path.join(process.cwd(), 'artifacts/logto-authz-plan.json'); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `${JSON.stringify(redact(plan), null, 2)}\n`); return print({ mode, planPath: out, contractHash: plan.contractHash, catalogHash: plan.catalogHash, roleModelVersion: plan.roleModelVersion, planHash: plan.planHash, remoteStateStatus: plan.remoteStateStatus, summary: require('./drift-report').summarizePlan(plan) }) }
  if (mode === 'apply-rbac') { const planPath = argv[1]; if (!planPath) throw new Error('apply-rbac requires a plan path'); const approvedPlan = JSON.parse(fs.readFileSync(planPath, 'utf8')); const approval = parseApplyOptions(argv, env); const result = await applyAuthorizationPlan({ plan: approvedPlan, contract, remoteState, client, ...approval, preflightOk: preflight.valid }); return print({ mode, result }) }
  throw new Error(`Unknown logto authz mode: ${mode}`)
}
async function handleCustomClaims(mode, argv, env, options) {
  if (mode === 'apply-custom-claims') {
    const planPath = argv[1]
    if (!planPath) throw new Error('apply-custom-claims requires a plan path')
    const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'))
    const config = loadLogtoBootstrapConfig(env, { requireCredentials: !options.client })
    const client = options.client || createLogtoManagementApiClient(config, options.clientOptions)
    return print({ mode, result: await applyCustomClaimsPlan({ plan, client, ...parseApplyOptions(argv, env) }) })
  }
  const plan = buildCustomClaimsPlan({ remoteScriptHash: options.remoteScriptHash || null, targetEnvironment: env.LOGTO_ENDPOINT || 'unknown' })
  if (mode === 'check-custom-claims') { const validation = validateCustomClaimsPlan(plan); return print({ mode, ok: validation.valid, validation, planHash: plan.planHash }) }
  if (mode === 'plan-custom-claims') {
    const out = argv[1] || path.join(process.cwd(), 'artifacts/logto-custom-claims-plan.json')
    fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, `${JSON.stringify(plan, null, 2)}\n`)
    return print({ mode, planPath: out, planHash: plan.planHash, operations: plan.operations.length })
  }
  throw new Error(`Unknown custom claims mode: ${mode}`)
}
function print(value) { console.log(JSON.stringify(redact(value), null, 2)); return value }
if (require.main === module) main().catch((error)=>{ console.error(JSON.stringify(redact({ error: error.message, code: error.code, details: error.details }), null, 2)); process.exit(1) })
module.exports = { main, parseApplyOptions }
