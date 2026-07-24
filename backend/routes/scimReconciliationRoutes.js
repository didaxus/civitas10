'use strict'

const { createScimReconciliationService } = require('../scim/reconciliation/service')
const { requireIdempotencyKey, requireTenantMatch } = require('./identityFederationRoutes')

const OWNER_READ_PERMISSION = 'owner.runtime.read'
const OWNER_WRITE_PERMISSION = 'owner.runtime.operations.execute'
const TENANT_READ_PERMISSION = 'org.documents.read'
const TENANT_WRITE_PERMISSION = 'org.documents.create'

function sendError(res, error) { return res.status(error.status || 500).json({ error: error.message || 'scim_reconciliation_error', ...(error.currentPlanHash ? { currentPlanHash: error.currentPlanHash } : {}) }) }
function registerScimReconciliationRoutes({ secureRoute, requireSafeOrganizationIdParam, requireGlobalAccess, requireGlobalOwner, requireOrganizationAccess, requireOrg, requireOrganizationRole, requirePermission, sharedAuth, apiResource, service = createScimReconciliationService() }) {
  const actorId = (req) => req.auth?.subject || req.user?.sub || req.user?.id || 'unknown'
  const ownerBase = '/api/v1/owner/organizations/:organizationId/scim/reconciliation'
  const tenantBase = '/api/v1/o/:organizationId/scim/reconciliation'
  const ownerRead = [requireGlobalAccess({ resource: apiResource, requiredScopes: [OWNER_READ_PERMISSION] }), requireGlobalOwner, requireSafeOrganizationIdParam]
  const ownerWrite = [requireGlobalAccess({ resource: apiResource, requiredScopes: [OWNER_WRITE_PERMISSION] }), requireGlobalOwner, requireSafeOrganizationIdParam]
  const tenantRead = [requireSafeOrganizationIdParam, requireOrganizationAccess({ resource: apiResource, requiredAllScopes: [TENANT_READ_PERMISSION] }), requireOrg, requireTenantMatch, requireOrganizationRole(sharedAuth.organization.roles.member), requirePermission(TENANT_READ_PERMISSION)]
  const tenantWrite = [requireSafeOrganizationIdParam, requireOrganizationAccess({ resource: apiResource, requiredAllScopes: [TENANT_WRITE_PERMISSION] }), requireOrg, requireTenantMatch, requireOrganizationRole(sharedAuth.organization.roles.admin), requirePermission(TENANT_WRITE_PERMISSION)]
  for (const [base, readMw, writeMw, readPolicy, writePolicy] of [[ownerBase, ownerRead, ownerWrite, 'ownerRead', 'ownerSensitiveWrite'], [tenantBase, tenantRead, tenantWrite, 'organizationMemberRead', 'organizationAdminWrite']]) {
    secureRoute.post(`${base}/plans`, readPolicy, ...readMw, async (req, res) => { try { return res.json(await service.dryRun({ organizationId: req.params.organizationId, body: req.body || {} })) } catch (e) { return sendError(res, e) } })
    secureRoute.post(`${base}/runs`, writePolicy, ...writeMw, requireIdempotencyKey, async (req, res) => { try { return res.status(202).json(await service.execute({ organizationId: req.params.organizationId, body: req.body || {}, idempotencyKey: req.idempotencyKey, actorId: actorId(req) })) } catch (e) { return sendError(res, e) } })
    secureRoute.get(`${base}/runs/:runId`, readPolicy, ...readMw, async (req, res) => { try { const run = await service.getRun({ organizationId: req.params.organizationId, runId: req.params.runId }); return run ? res.json(run) : res.status(404).json({ error: 'run_not_found' }) } catch (e) { return sendError(res, e) } })
  }
}
module.exports = { registerScimReconciliationRoutes }
