'use strict'

const { ACTIONS, planScimReconciliation, hash } = require('./planner')
const logto = require('../../services/logtoManagement')

class InMemoryScimReconciliationRepository {
  constructor({ desiredState = {}, civitasState = {}, logtoState = {}, policy = {} } = {}) { this.desiredState = desiredState; this.civitasState = civitasState; this.logtoState = logtoState; this.policy = policy; this.runs = new Map() }
  async loadInputs() { return { desiredState: this.desiredState, civitasState: this.civitasState, logtoState: this.logtoState, policy: this.policy } }
  async saveRun(run) { this.runs.set(run.id, run); return run }
  async getRun(id) { return this.runs.get(id) || null }
}

function createScimReconciliationService({ repository = new InMemoryScimReconciliationRepository(), logtoClient = logto } = {}) {
  async function buildPlan({ organizationId, body = {}, mode = 'dry-run' } = {}) {
    const inputs = await repository.loadInputs({ organizationId, providerId: body.providerId })
    const plan = planScimReconciliation({ ...inputs, ...body, now: body.now })
    return { ...plan, organizationId, mode }
  }
  async function dryRun(args) { return buildPlan({ ...args, mode: 'dry-run' }) }
  async function execute({ organizationId, body = {}, idempotencyKey, actorId = 'unknown' } = {}) {
    if (!idempotencyKey) { const error = new Error('idempotency_key_required'); error.status = 400; throw error }
    const previous = await repository.getRun(idempotencyKey)
    if (previous) return previous
    const plan = await buildPlan({ organizationId, body, mode: 'execute' })
    if (body.expectedPlanHash && body.expectedPlanHash !== plan.planHash) { const error = new Error('stale_plan_hash'); error.status = 412; error.currentPlanHash = plan.planHash; throw error }
    const results = []
    for (const item of plan.actions) results.push(await applyAction({ action: item, organizationId, logtoClient }))
    const run = { id: idempotencyKey, organizationId, actorId, contractVersion: plan.contractVersion, planHash: plan.planHash, status: results.some((r) => r.status === 'failed') ? 'failed' : 'completed', summary: plan.summary, results }
    return repository.saveRun(run)
  }
  async function getRun({ runId }) { return repository.getRun(runId) }
  return { dryRun, execute, getRun }
}

async function applyAction({ action, organizationId, logtoClient }) {
  if (!action.mutates || action.type === ACTIONS.NOOP) return { actionId: action.id, type: action.type, status: 'skipped' }
  try {
    const t = action.target || {}
    if (action.type === ACTIONS.CREATE_USER) await logtoClient.createLogtoUser({ email: t.email, primaryEmail: t.email, customData: { scimExternalId: t.externalId } })
    else if (action.type === ACTIONS.LINK_USER && logtoClient.updateLogtoUser) await logtoClient.updateLogtoUser({ userId: t.logtoUserId, customData: { scimExternalId: t.externalId } })
    else if (action.type === ACTIONS.ACTIVATE_USER || action.type === ACTIONS.SUSPEND_USER) await logtoClient.updateLogtoUser({ userId: t.logtoUserId, customData: { civitasScimLifecycle: action.type } })
    else if (action.type === ACTIONS.ADD_ORGANIZATION_MEMBERSHIP) await logtoClient.addUserToLogtoOrganization({ organizationId: t.organizationId || organizationId, userId: t.logtoUserId })
    else if (action.type === ACTIONS.REMOVE_ORGANIZATION_MEMBERSHIP) await logtoClient.removeUserFromLogtoOrganization({ organizationId: t.organizationId || organizationId, userId: t.logtoUserId })
    else if (action.type === ACTIONS.ADD_MANAGED_ROLE) for (const orgId of t.organizationIds || [organizationId]) await logtoClient.assignOrganizationRoleToUser({ organizationId: orgId, userId: t.logtoUserId, organizationRoleName: t.role })
    else if (action.type === ACTIONS.REMOVE_MANAGED_ROLE && logtoClient.removeManagedRoleFromUser) await logtoClient.removeManagedRoleFromUser({ organizationId: t.organizationId || organizationId, userId: t.logtoUserId, role: t.role })
    else return { actionId: action.id, type: action.type, status: 'skipped' }
    return { actionId: action.id, type: action.type, status: 'applied' }
  } catch (error) { return { actionId: action.id, type: action.type, status: 'failed', error: error.message } }
}

module.exports = { createScimReconciliationService, InMemoryScimReconciliationRepository, hash }
