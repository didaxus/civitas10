'use strict'

const { createIdentityFederationService } = require('../services/identityFederation')

const OWNER_READ_PERMISSION = 'owner.runtime.read'
const OWNER_WRITE_PERMISSION = 'owner.runtime.operations.execute'
const TENANT_READ_PERMISSION = 'org.documents.read'
const TENANT_WRITE_PERMISSION = 'org.documents.create'

function sendIdentityError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500
  if (status === 412) res.set('ETag', error.currentEtag)
  return res.status(status).json({ error: error?.message || 'identity_federation_error', ...(error?.currentEtag ? { currentEtag: error.currentEtag } : {}) })
}

function requireIdempotencyKey(req, res, next) {
  const value = req.get('Idempotency-Key')
  if (!value || !String(value).trim()) return res.status(400).json({ error: 'idempotency_key_required', header: 'Idempotency-Key' })
  req.idempotencyKey = String(value).trim()
  return next()
}

function requireIfMatch(req, res, next) {
  const value = req.get('If-Match')
  if (!value || !String(value).trim()) return res.status(428).json({ error: 'if_match_required', header: 'If-Match' })
  return next()
}

function requireTenantMatch(req, res, next) {
  const requested = req.params.organizationId
  const authOrg = req.auth?.organizationId || req.user?.organizationId || req.org?.logto_organization_id || req.org?.id
  if (authOrg && requested !== authOrg) return res.status(403).json({ error: 'organization_context_mismatch', code: 'organization_route_mismatch' })
  if (req.org && req.org.logto_organization_id !== requested && req.org.id !== requested) return res.status(403).json({ error: 'organization_record_mismatch' })
  return next()
}

function registerIdentityFederationRoutes({ secureRoute, requireSafeOrganizationIdParam, requireGlobalAccess, requireGlobalOwner, requireOrganizationAccess, requireOrg, requireOrganizationRole, requirePermission, sharedAuth, apiResource, service = createIdentityFederationService() }) {
  const actorId = (req) => req.auth?.subject || req.user?.sub || req.user?.id || 'unknown'
  const ownerBase = '/api/v1/owner/organizations/:organizationId/identity/federation'
  const tenantBase = '/api/v1/o/:organizationId/identity/federation'
  const ownerScimBase = '/api/v1/owner/organizations/:organizationId/scim/connections'
  const tenantScimBase = '/api/v1/o/:organizationId/scim/connections/:connectionId'

  const ownerRead = [requireGlobalAccess({ resource: apiResource, requiredScopes: [OWNER_READ_PERMISSION] }), requireGlobalOwner, requireSafeOrganizationIdParam, requireTenantMatch]
  const ownerWrite = [requireGlobalAccess({ resource: apiResource, requiredScopes: [OWNER_WRITE_PERMISSION] }), requireGlobalOwner, requireSafeOrganizationIdParam, requireTenantMatch]
  const tenantRead = [requireSafeOrganizationIdParam, requireOrganizationAccess({ resource: apiResource, requiredAllScopes: [TENANT_READ_PERMISSION] }), requireOrg, requireTenantMatch, requireOrganizationRole(sharedAuth.organization.roles.member), requirePermission(TENANT_READ_PERMISSION)]
  const tenantWrite = [requireSafeOrganizationIdParam, requireOrganizationAccess({ resource: apiResource, requiredAllScopes: [TENANT_WRITE_PERMISSION] }), requireOrg, requireTenantMatch, requireOrganizationRole(sharedAuth.organization.roles.admin), requirePermission(TENANT_WRITE_PERMISSION)]

  secureRoute.get(`${ownerBase}/providers`, 'ownerRead', ...ownerRead, async (req, res) => {
    try { return res.json(await service.listProviders({ organizationId: req.params.organizationId })) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.get(`${ownerBase}/providers/:providerId`, 'ownerRead', ...ownerRead, async (req, res) => {
    try { const result = await service.getProvider({ organizationId: req.params.organizationId, providerId: req.params.providerId }); res.set('ETag', result.etag); return res.json(result) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.put(`${ownerBase}/providers/:providerId`, 'ownerSensitiveWrite', ...ownerWrite, requireIfMatch, async (req, res) => {
    try { const result = await service.updateProvider({ organizationId: req.params.organizationId, providerId: req.params.providerId, body: req.body, ifMatch: req.get('If-Match'), actorId: actorId(req) }); res.set('ETag', result.etag); return res.json(result) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.post(`${ownerBase}/providers/:providerId/state-decisions`, 'ownerSensitiveWrite', ...ownerWrite, requireIdempotencyKey, requireIfMatch, async (req, res) => {
    try { const result = await service.decideProviderState({ organizationId: req.params.organizationId, providerId: req.params.providerId, body: req.body, ifMatch: req.get('If-Match'), idempotencyKey: req.idempotencyKey, actorId: actorId(req) }); res.set('ETag', result.etag); return res.status(202).json(result) } catch (error) { return sendIdentityError(res, error) }
  })

  secureRoute.get(`${tenantBase}/providers`, 'organizationMemberRead', ...tenantRead, async (req, res) => {
    try { return res.json(await service.listProviders({ organizationId: req.params.organizationId })) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.get(`${tenantBase}/providers/:providerId`, 'organizationMemberRead', ...tenantRead, async (req, res) => {
    try { const result = await service.getProvider({ organizationId: req.params.organizationId, providerId: req.params.providerId }); res.set('ETag', result.etag); return res.json(result) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.put(`${tenantBase}/providers/:providerId`, 'organizationAdminWrite', ...tenantWrite, requireIfMatch, async (req, res) => {
    try { const result = await service.updateProvider({ organizationId: req.params.organizationId, providerId: req.params.providerId, body: req.body, ifMatch: req.get('If-Match'), actorId: actorId(req) }); res.set('ETag', result.etag); return res.json(result) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.post(`${tenantBase}/providers/:providerId/state-decisions`, 'organizationAdminWrite', ...tenantWrite, requireIdempotencyKey, requireIfMatch, async (req, res) => {
    try { const result = await service.decideProviderState({ organizationId: req.params.organizationId, providerId: req.params.providerId, body: req.body, ifMatch: req.get('If-Match'), idempotencyKey: req.idempotencyKey, actorId: actorId(req) }); res.set('ETag', result.etag); return res.status(202).json(result) } catch (error) { return sendIdentityError(res, error) }
  })

  secureRoute.get(ownerScimBase, 'ownerRead', ...ownerRead, async (req, res) => {
    try { return res.json(await service.listScimConnections({ organizationId: req.params.organizationId })) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.post(ownerScimBase, 'ownerSensitiveWrite', ...ownerWrite, async (req, res) => {
    try { const result = await service.createScimConnection({ organizationId: req.params.organizationId, body: req.body, actorId: actorId(req) }); res.set('ETag', result.etag); return res.status(201).json(result) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.post(`${ownerScimBase}/:connectionId/credentials`, 'ownerSensitiveWrite', ...ownerWrite, requireIdempotencyKey, async (req, res) => {
    try { const result = await service.rotateScimCredentials({ organizationId: req.params.organizationId, connectionId: req.params.connectionId, body: req.body, idempotencyKey: req.idempotencyKey, actorId: actorId(req) }); res.set('ETag', result.etag); return res.status(202).json(result) } catch (error) { return sendIdentityError(res, error) }
  })

  secureRoute.get(tenantScimBase, 'organizationMemberRead', ...tenantRead, async (req, res) => {
    try { const result = await service.getScimConnection({ organizationId: req.params.organizationId, connectionId: req.params.connectionId }); res.set('ETag', result.etag); return res.json(result) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.put(tenantScimBase, 'organizationAdminWrite', ...tenantWrite, requireIfMatch, async (req, res) => {
    try { const result = await service.updateScimConnection({ organizationId: req.params.organizationId, connectionId: req.params.connectionId, body: req.body, ifMatch: req.get('If-Match'), actorId: actorId(req) }); res.set('ETag', result.etag); return res.json(result) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.post(`${tenantScimBase}/reconciliation-plans`, 'organizationAdminWrite', ...tenantWrite, requireIdempotencyKey, async (req, res) => {
    try { return res.status(202).json(await service.createScimReconciliationPlan({ organizationId: req.params.organizationId, connectionId: req.params.connectionId, body: req.body, idempotencyKey: req.idempotencyKey, actorId: actorId(req) })) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.get(`${tenantScimBase}/reconciliation-plans`, 'organizationMemberRead', ...tenantRead, async (req, res) => {
    try { return res.json(await service.listScimReconciliationPlans({ organizationId: req.params.organizationId, connectionId: req.params.connectionId })) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.post(`${tenantScimBase}/reconciliation-runs`, 'organizationAdminWrite', ...tenantWrite, requireIdempotencyKey, async (req, res) => {
    try { return res.status(202).json(await service.createScimReconciliationRun({ organizationId: req.params.organizationId, connectionId: req.params.connectionId, body: req.body, idempotencyKey: req.idempotencyKey, actorId: actorId(req) })) } catch (error) { return sendIdentityError(res, error) }
  })
  secureRoute.get(`${tenantScimBase}/reconciliation-runs`, 'organizationMemberRead', ...tenantRead, async (req, res) => {
    try { return res.json(await service.listScimReconciliationRuns({ organizationId: req.params.organizationId, connectionId: req.params.connectionId })) } catch (error) { return sendIdentityError(res, error) }
  })
}

module.exports = { OWNER_READ_PERMISSION, OWNER_WRITE_PERMISSION, TENANT_READ_PERMISSION, TENANT_WRITE_PERMISSION, registerIdentityFederationRoutes, requireIdempotencyKey, requireIfMatch, requireTenantMatch }
