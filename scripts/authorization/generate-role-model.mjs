#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { loadCatalog, catalogHash, ORGANIZATION_ROLES } from './permission-catalog-utils.mjs'

const SOURCE = 'contracts/authorization/civitas-role-bundles.json'
const CATALOG_SOURCE = 'contracts/authorization/civitas-permission-catalog.yaml'
const COMMAND = 'npm run authz:role-model:generate'
const check = process.argv.includes('--check')
const outputRoot = process.env.CIVITAS_AUTHZ_OUTPUT_ROOT || '.'
const out = (file) => path.join(outputRoot, file)
const canonicalJson = (value) => Array.isArray(value) ? `[${value.map(canonicalJson).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key)=>`${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}` : JSON.stringify(value)
const sha = (value) => crypto.createHash('sha256').update(canonicalJson(value)).digest('hex')
function assertInput(file) { if (!fs.existsSync(file)) throw new Error(`${file} is missing`) }
try { assertInput(SOURCE); assertInput(CATALOG_SOURCE) } catch (error) { console.error(error.message); process.exit(1) }
const authored = JSON.parse(fs.readFileSync(SOURCE, 'utf8'))
const catalog = loadCatalog()
const cHash = catalogHash(catalog)
const orgPermissions = catalog.permissions.filter((permission) => permission.surface === 'organization' && permission.namespace !== 'owner').sort((a,b)=>a.name.localeCompare(b.name))
const orgPermissionIds = orgPermissions.map((permission)=>permission.name)
const activeOrgIds = new Set(orgPermissions.filter((permission)=>permission.targetStatus === 'active' && permission.observedImplementation === 'active' && permission.runtimePath && permission.testEvidence?.length).map((permission)=>permission.name))
const byNamespace = Object.groupBy ? Object.groupBy(orgPermissions, (permission)=>permission.namespace) : orgPermissions.reduce((acc, permission)=>{(acc[permission.namespace] ||= []).push(permission); return acc}, {})
const bundleSelectors = {
  org_documents_reader: ['org.documents.read'], org_documents_editor: ['org.documents.create'], org_documents_admin: ['org.documents.manage','org.settings.read'],
  org_members_reader: ['org.members.read'], org_members_operator: ['org.members.invite'], org_members_admin: ['org.members.archive','org.roles.create'], org_roles_operator: ['org.roles.create'],
  org_governance_reader: ['org.settings.read'], org_governance_admin: ['org.groups.approve','org.workflows.delete'], org_audit_reader: ['org.analytics.export'], org_authorization_reader: ['org.reports.approve'], org_authorization_admin: ['org.roles.create','org.groups.update'], org_units_reader: ['org.groups.update'], org_units_admin: ['org.groups.approve'],
  academic_reader: ['lms.course_offerings.read','lms.groups.read','lms.group_members.read','lms.assignments.read'], academic_manager: ['lms.attendance.manage','lms.groups.manage','lms.grades.export'], group_leader: ['lms.groups.read','lms.group_members.read','lms.course_offerings.read'], teacher: ['lms.assignments.create','lms.submissions.update','lms.quizzes.create','lms.rubrics.read'], student_self: ['lms.assignments.read','lms.rubrics.read'], parent_linked: ['lms.course_offerings.read','lms.group_members.read'],
  planning_reader: ['planning.milestones.read','planning.plans.read','planning.profile.read'], planning_reviewer: ['planning.dependencies.approve','planning.proposals.update','planning.risks.export'], planning_approver: ['planning.approvals.archive','planning.approvals.export','planning.budgets.approve','planning.surveys.approve','planning.votes.archive'], planning_author: ['planning.initiatives.create','planning.milestones.update','planning.tasks.create','planning.votes.create'], planning_admin: ['planning.budgets.update','planning.dependencies.manage','planning.plans.manage','planning.profile.manage'], planning_production: ['planning.initiatives.archive','planning.minutes.delete','planning.risks.delete','planning.roadmaps.export','planning.tasks.delete'],
  crm_reader: ['crm.contacts.read'], crm_operator: (byNamespace.crm || []).map((p)=>p.name).filter((name)=>name !== 'crm.contacts.read'), community_member: ['community.posts.read'], community_moderator: (byNamespace.community || []).map((p)=>p.name), scheduling_user: ['scheduling.events.read'], scheduling_operator: (byNamespace.scheduling || []).map((p)=>p.name), support_user: ['support.tickets.read'], support_operator: (byNamespace.support || []).map((p)=>p.name), analytics_reader: (byNamespace.analytics || []).map((p)=>p.name), reports_reader: ['reports.records.read'], reports_generator: (byNamespace.reports || []).map((p)=>p.name), platform_adapter_reader: ['platform.records.read'], platform_adapter_admin: (byNamespace.platform || []).map((p)=>p.name), communications_user: ['org.announcements.read'], communications_operator: ['org.announcements.read','org.forms.update'], notification_preferences_self: ['org.announcements.read'], accounting_reader: ['payments.records.read','payments.dashboards.read'], accounting_operator: ['payments.reports.update','payments.metrics.export'], subscription_billing_reader: ['payments.records.read'], subscription_billing_operator: ['payments.requests.manage','payments.tasks.update'], payroll_reader: ['hr.records.read'], payroll_operator: ['hr.tasks.update','hr.requests.manage'], payroll_approver: ['hr.approvals.archive','hr.files.approve']
}
const bundleDefinitions = authored.bundles.map((key)=>Object.freeze({ key, description: `${key} canonical Phase 3 role-potential bundle`, permissionIds: Object.freeze([...(bundleSelectors[key] || [])].filter((id)=>orgPermissionIds.includes(id)).sort()), allowedRoleKeys: Object.freeze(Object.entries(authored.roles).filter(([, role])=>role.bundles.includes(key)).map(([roleKey])=>roleKey).sort()), lifecycle: 'planned', version: authored.roleModelVersion }))
const bundleByKey = new Map(bundleDefinitions.map((bundle)=>[bundle.key, bundle]))
function normalizePotential(ids) {
  return [...new Set(ids)].filter((id)=>orgPermissionIds.includes(id)).sort()
}
const roles = ORGANIZATION_ROLES.map((roleKey)=>{
  const role = authored.roles[roleKey]
  const fromBundles = role.bundles.flatMap((bundleKey)=>bundleByKey.get(bundleKey)?.permissionIds || [])
  const potentialPermissionIds = normalizePotential(fromBundles)
  if (potentialPermissionIds.length !== role.expectedPotentialCount) throw new Error(`${roleKey} expectedPotentialCount ${role.expectedPotentialCount} does not match ${potentialPermissionIds.length} reconciled permissions`)
  const activeExecutableScopeIds = potentialPermissionIds.filter((id)=>activeOrgIds.has(id)).sort()
  const provisionableScopeIds = potentialPermissionIds.filter((id)=>catalog.permissions.find((permission)=>permission.name===id)?.identityProvisioning==='provisionable').sort()
  return Object.freeze({ roleKey, displayName: role.displayName, description: role.description, surface: 'organization', bundleKeys: Object.freeze([...role.bundles]), potentialPermissionIds: Object.freeze(potentialPermissionIds), provisionableScopeIds: Object.freeze(provisionableScopeIds), activeExecutableScopeIds: Object.freeze(activeExecutableScopeIds), expectedPotentialCount: role.expectedPotentialCount, version: authored.roleModelVersion })
})
const roleModel = Object.freeze({ roleModelVersion: authored.roleModelVersion, contractVersion: authored.contractVersion, catalogHash: cHash, roleModelHash: sha({ authored, catalogHash: cHash }), bundles: bundleDefinitions, roles })
const metadata = Object.freeze({ notice: 'GENERATED — DO NOT EDIT', source: SOURCE, catalogSource: CATALOG_SOURCE, command: COMMAND, catalogHash: cHash, roleModelHash: roleModel.roleModelHash })
const runtime = `// GENERATED — DO NOT EDIT.\n// Source: ${SOURCE}\n// Regenerate: ${COMMAND}\n\n'use strict'\n\nconst generated = Object.freeze(${JSON.stringify({ _generated: metadata, roleModel }, null, 2)})\nconst roleModel = Object.freeze(generated.roleModel)\nconst bundles = Object.freeze(roleModel.bundles.map(Object.freeze))\nconst roles = Object.freeze(roleModel.roles.map(Object.freeze))\nconst rolesByKey = Object.freeze(Object.fromEntries(roles.map((role) => [role.roleKey, role])))\nconst activeRoleScopes = Object.freeze(Object.fromEntries(roles.map((role) => [role.roleKey, Object.freeze([...role.activeExecutableScopeIds])])) )\nconst provisionableRoleScopes = Object.freeze(Object.fromEntries(roles.map((role) => [role.roleKey, Object.freeze([...role.provisionableScopeIds])])) )\nmodule.exports = { generated, roleModel, roleModelHash: roleModel.roleModelHash, catalogHash: roleModel.catalogHash, bundles, roles, rolesByKey, activeRoleScopes, provisionableRoleScopes }\n`
const json = (body) => JSON.stringify({ _generated: metadata, ...body }, null, 2) + '\n'
const outputs = {
  'core/authz/roles/generated/role-model.js': runtime,
  'artifacts/authorization/role-potential.json': json({ roleModel }),
  'artifacts/authorization/active-role-scopes.json': json({ catalogHash: cHash, roleModelHash: roleModel.roleModelHash, activeRoleScopes: Object.fromEntries(roles.map((role)=>[role.roleKey, role.activeExecutableScopeIds])) }),
  'artifacts/authorization/provisionable-role-scopes.json': json({ catalogHash: cHash, roleModelHash: roleModel.roleModelHash, provisionableRoleScopes: Object.fromEntries(roles.map((role)=>[role.roleKey, role.provisionableScopeIds])) })
}
const failures = []
for (const [file, body] of Object.entries(outputs)) {
  const target = out(file)
  if (!fs.existsSync(target)) failures.push(`${file}: missing generated artifact`)
  else {
    const actual = fs.readFileSync(target,'utf8')
    if (actual !== body) failures.push(`${file}: generated artifact differs`)
    if (!actual.includes('GENERATED — DO NOT EDIT') || !actual.includes(roleModel.roleModelHash)) failures.push(`${file}: missing GENERATED metadata or roleModelHash`)
  }
  if (!check) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, body) }
}
if (check && failures.length) { console.error(failures.join('\n')); process.exit(1) }
console.log(`${check ? 'checked' : 'generated'} role model ${roleModel.roleModelHash}`)
