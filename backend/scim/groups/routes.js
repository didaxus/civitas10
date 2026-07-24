'use strict'

const { createScimGroupService } = require('./groupService')

function sendScimError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 500
  return res.status(status).json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: String(status), detail: error?.message || 'scim_group_error' })
}

function registerScimGroupRoutes({ secureRoute, service = createScimGroupService(), middleware = [] } = {}) {
  const base = '/scim/v2/connections/:connectionId/Groups'
  const chain = Array.isArray(middleware) ? middleware : [middleware]
  secureRoute.post(base, 'authenticatedWrite', ...chain, async (req, res) => { try { return res.status(201).json(await service.createGroup({ connectionId: req.params.connectionId, body: req.body })) } catch (e) { return sendScimError(res, e) } })
  secureRoute.get(base, 'authenticatedRead', ...chain, async (req, res) => { try { return res.json(await service.listGroups({ connectionId: req.params.connectionId, filter: req.query.filter, startIndex: req.query.startIndex, count: req.query.count })) } catch (e) { return sendScimError(res, e) } })
  secureRoute.get(`${base}/:groupId`, 'authenticatedRead', ...chain, async (req, res) => { try { return res.json(await service.getGroup({ connectionId: req.params.connectionId, groupId: req.params.groupId })) } catch (e) { return sendScimError(res, e) } })
  secureRoute.put(`${base}/:groupId`, 'authenticatedWrite', ...chain, async (req, res) => { try { return res.json(await service.replaceGroup({ connectionId: req.params.connectionId, groupId: req.params.groupId, body: req.body })) } catch (e) { return sendScimError(res, e) } })
  secureRoute.patch(`${base}/:groupId`, 'authenticatedWrite', ...chain, async (req, res) => { try { return res.json(await service.patchGroup({ connectionId: req.params.connectionId, groupId: req.params.groupId, body: req.body })) } catch (e) { return sendScimError(res, e) } })
  secureRoute.delete(`${base}/:groupId`, 'authenticatedWrite', ...chain, async (req, res) => { try { await service.deleteGroup({ connectionId: req.params.connectionId, groupId: req.params.groupId }); return res.status(204).end() } catch (e) { return sendScimError(res, e) } })
}

module.exports = { registerScimGroupRoutes, sendScimError }
