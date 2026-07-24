'use strict'

const { createScimUserService, errorBody } = require('./service')

function send(res, result) {
  if (result?.user?.meta?.version) res.set('ETag', result.user.meta.version)
  if (result?.status === 204) return res.status(204).end()
  return res.status(result?.status || 200).json(result.user || result)
}

function sendScimError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500
  if (error?.currentEtag) res.set('ETag', error.currentEtag)
  return res.status(status).json(errorBody({ ...error, status }))
}

function registerScimUserRoutes({ secureRoute, service = createScimUserService() }) {
  const base = '/scim/v2/connections/:connectionId/Users'
  const idem = (req) => req.get('Idempotency-Key') || undefined
  secureRoute.post(base, 'authenticatedWrite', async (req, res) => {
    try { return send(res, await service.create({ connectionId: req.params.connectionId, body: req.body, idempotencyKey: idem(req) })) } catch (e) { return sendScimError(res, e) }
  })
  secureRoute.get(base, 'authenticatedRead', async (req, res) => {
    try { return res.json(await service.list({ connectionId: req.params.connectionId, startIndex: req.query.startIndex, count: req.query.count, filter: req.query.filter })) } catch (e) { return sendScimError(res, e) }
  })
  secureRoute.get(`${base}/:userId`, 'authenticatedRead', async (req, res) => {
    try { const user = await service.get({ connectionId: req.params.connectionId, userId: req.params.userId }); res.set('ETag', user.meta.version); return res.json(user) } catch (e) { return sendScimError(res, e) }
  })
  secureRoute.put(`${base}/:userId`, 'authenticatedWrite', async (req, res) => {
    try { return send(res, await service.put({ connectionId: req.params.connectionId, userId: req.params.userId, body: req.body, ifMatch: req.get('If-Match'), idempotencyKey: idem(req) })) } catch (e) { return sendScimError(res, e) }
  })
  secureRoute.patch(`${base}/:userId`, 'authenticatedWrite', async (req, res) => {
    try { return send(res, await service.patch({ connectionId: req.params.connectionId, userId: req.params.userId, body: req.body, ifMatch: req.get('If-Match'), idempotencyKey: idem(req) })) } catch (e) { return sendScimError(res, e) }
  })
  secureRoute.delete(`${base}/:userId`, 'authenticatedWrite', async (req, res) => {
    try { return send(res, await service.delete({ connectionId: req.params.connectionId, userId: req.params.userId, ifMatch: req.get('If-Match'), idempotencyKey: idem(req) })) } catch (e) { return sendScimError(res, e) }
  })
}

module.exports = { registerScimUserRoutes, sendScimError }
