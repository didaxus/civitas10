'use strict'

const crypto = require('node:crypto')
const { ACTIONS, MUTATING_ACTIONS } = require('./actions')

const CONTRACT_VERSION = 'civitas-scim-reconciliation/v1'

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function hash(value) { return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex') }
const arr = (value) => Array.isArray(value) ? value : []
const key = (value) => String(value || '').trim().toLowerCase()
const uniq = (values) => [...new Set(arr(values).map(String).filter(Boolean))].sort()
const userKey = (u = {}) => key(u.externalId || u.userName || u.email || u.primaryEmail || u.id)
const logtoId = (u = {}) => u.logtoUserId || u.id || u.userId || null
const active = (u = {}) => u.active !== false && u.suspended !== true && u.isSuspended !== true
const roleName = (r) => typeof r === 'string' ? r : (r?.name || r?.key || r?.id)

function normalizeDesiredUser(user = {}) {
  return {
    externalId: user.externalId || user.id || user.userName || user.email || null,
    userName: user.userName || user.email || user.primaryEmail || null,
    email: user.email || user.primaryEmail || null,
    displayName: user.displayName || user.name || null,
    active: user.active !== false,
    organizationIds: uniq(user.organizationIds || user.organizations || user.groups),
    managedRoles: uniq(user.managedRoles || user.roles),
    requiresApproval: Boolean(user.requiresApproval),
  }
}

function action(type, target, reason, details = {}) {
  const stable = { type, target, reason, details }
  return { id: `${type}:${hash(stable).slice(0, 16)}`, mutates: MUTATING_ACTIONS.has(type), ...stable }
}

function planScimReconciliation({ desiredState = {}, civitasState = {}, logtoState = {}, policy = {}, now = new Date(0).toISOString() } = {}) {
  const desiredUsers = arr(desiredState.users).map(normalizeDesiredUser).sort((a, b) => userKey(a).localeCompare(userKey(b)))
  const provenanceUsers = new Map(arr(civitasState.userLinks || civitasState.sources || civitasState.provenance).map((p) => [key(p.externalId || p.scimExternalId || p.userName || p.email), p]))
  const actualUsersByExternal = new Map(arr(logtoState.users).flatMap((u) => [[userKey(u), u], [key(u.email || u.primaryEmail), u], [key(u.userName || u.username), u]]).filter(([k]) => k))
  const actualUsersById = new Map(arr(logtoState.users).map((u) => [logtoId(u), u]).filter(([id]) => id))
  const actualOrgMembers = new Map(arr(logtoState.organizationMemberships).map((m) => [`${m.organizationId}:${m.userId}`, m]))
  const actualRoles = new Map(arr(logtoState.managedRoles || logtoState.organizationRoles).map((r) => [`${r.organizationId || ''}:${r.userId}:${roleName(r)}`, r]))
  const ceilingRoles = new Set(arr(policy.allowedManagedRoles || policy.ceilingRoles).map(String))
  const protectedOrganizations = new Set(arr(policy.protectedOrganizationIds).map(String))
  const destructiveRequiresApproval = policy.destructiveRequiresApproval !== false
  const actions = []
  const desiredActualIds = new Set()

  for (const desired of desiredUsers) {
    const provenance = provenanceUsers.get(userKey(desired))
    const actual = provenance?.logtoUserId ? actualUsersById.get(provenance.logtoUserId) : (actualUsersByExternal.get(userKey(desired)) || actualUsersByExternal.get(key(desired.email)) || actualUsersByExternal.get(key(desired.userName)))
    const userId = actual ? logtoId(actual) : (provenance?.logtoUserId || null)
    if (userId) desiredActualIds.add(userId)
    if (!actual && !provenance?.logtoUserId) actions.push(action(ACTIONS.CREATE_USER, { externalId: desired.externalId, email: desired.email }, 'desired_scim_user_missing_in_logto'))
    else if (!provenance?.logtoUserId && actual) actions.push(action(ACTIONS.LINK_USER, { externalId: desired.externalId, logtoUserId: logtoId(actual) }, 'actual_logto_user_missing_civitas_source_link'))
    if (actual && desired.active && !active(actual)) actions.push(action(ACTIONS.ACTIVATE_USER, { logtoUserId: logtoId(actual), externalId: desired.externalId }, 'desired_scim_user_active'))
    if (actual && !desired.active && active(actual)) actions.push(action(destructiveRequiresApproval ? ACTIONS.REQUIRE_APPROVAL : ACTIONS.SUSPEND_USER, { logtoUserId: logtoId(actual), externalId: desired.externalId }, 'desired_scim_user_inactive'))
    for (const orgId of desired.organizationIds) if (userId && !actualOrgMembers.has(`${orgId}:${userId}`)) actions.push(action(ACTIONS.ADD_ORGANIZATION_MEMBERSHIP, { organizationId: orgId, logtoUserId: userId }, 'desired_scim_membership_missing'))
    for (const role of desired.managedRoles) {
      if (ceilingRoles.size && !ceilingRoles.has(role)) actions.push(action(ACTIONS.BLOCK_BY_CEILING, { role, logtoUserId: userId, externalId: desired.externalId }, 'managed_role_not_allowed_by_owner_ceiling'))
      else if (userId && !arr(desired.organizationIds).some((orgId) => actualRoles.has(`${orgId}:${userId}:${role}`))) actions.push(action(ACTIONS.ADD_MANAGED_ROLE, { organizationIds: desired.organizationIds, role, logtoUserId: userId }, 'desired_scim_managed_role_missing'))
    }
  }

  const desiredMembershipKeys = new Set(desiredUsers.flatMap((u) => arr(u.organizationIds).map((orgId) => `${orgId}:${provenanceUsers.get(userKey(u))?.logtoUserId || logtoId(actualUsersByExternal.get(userKey(u)) || actualUsersByExternal.get(key(u.email)) || actualUsersByExternal.get(key(u.userName)))}`)))
  for (const [membershipKey, membership] of actualOrgMembers) {
    if (!desiredActualIds.has(membership.userId) || desiredMembershipKeys.has(membershipKey) || protectedOrganizations.has(membership.organizationId)) continue
    actions.push(action(destructiveRequiresApproval ? ACTIONS.REQUIRE_APPROVAL : ACTIONS.REMOVE_ORGANIZATION_MEMBERSHIP, { organizationId: membership.organizationId, logtoUserId: membership.userId }, 'actual_membership_absent_from_scim_desired_state'))
  }
  for (const [roleKeyValue, role] of actualRoles) {
    const userId = role.userId
    if (!desiredActualIds.has(userId)) continue
    const desiredUser = desiredUsers.find((u) => (provenanceUsers.get(userKey(u))?.logtoUserId || logtoId(actualUsersByExternal.get(userKey(u)) || actualUsersByExternal.get(key(u.email)) || actualUsersByExternal.get(key(u.userName)))) === userId)
    if (desiredUser?.managedRoles.includes(roleName(role))) continue
    actions.push(action(destructiveRequiresApproval ? ACTIONS.REQUIRE_APPROVAL : ACTIONS.REMOVE_MANAGED_ROLE, { organizationId: role.organizationId || null, role: roleName(role), logtoUserId: userId }, 'actual_managed_role_absent_from_scim_desired_state', { roleKey: roleKeyValue }))
  }

  if (!actions.length) actions.push(action(ACTIONS.NOOP, { scope: 'reconciliation' }, 'desired_civitas_and_logto_states_already_converged'))
  actions.sort((a, b) => a.id.localeCompare(b.id))
  const plan = { contractVersion: CONTRACT_VERSION, generatedAt: now, mode: 'dry-run', summary: { actionCount: actions.length, mutationCount: actions.filter((a) => a.mutates).length }, actions, fingerprints: { desired: hash(desiredState), civitas: hash(civitasState), logto: hash(logtoState), policy: hash(policy) } }
  plan.planHash = hash({ ...plan, generatedAt: undefined, planHash: undefined })
  return Object.freeze(plan)
}

module.exports = { ACTIONS, CONTRACT_VERSION, canonicalJson, hash, planScimReconciliation }
