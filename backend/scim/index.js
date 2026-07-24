'use strict'

const SERVICE_PROVIDER_CONFIG_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'
const RESOURCE_TYPE_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:ResourceType'
const SCHEMA_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Schema'
const USER_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:User'
const GROUP_SCHEMA = 'urn:ietf:params:scim:schemas:core:2.0:Group'
const LIST_RESPONSE_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse'

const DEFAULT_FILTER_MAX_RESULTS = 200
const CONNECTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

const absoluteUrl = (req, path = req.path) => `${req.protocol}://${req.get('host')}${req.baseUrl || ''}${path}`

const addLocation = (req, resource, path) => ({
  ...resource,
  meta: {
    ...resource.meta,
    location: absoluteUrl(req, path),
  },
})

const listResponse = (resources) => ({
  schemas: [LIST_RESPONSE_SCHEMA],
  totalResults: resources.length,
  Resources: resources,
  startIndex: 1,
  itemsPerPage: resources.length,
})

const serviceProviderConfig = ({ filterMaxResults = DEFAULT_FILTER_MAX_RESULTS } = {}) => ({
  schemas: [SERVICE_PROVIDER_CONFIG_SCHEMA],
  documentationUri: 'https://www.rfc-editor.org/rfc/rfc7644',
  patch: { supported: true },
  bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
  filter: { supported: true, maxResults: filterMaxResults },
  changePassword: { supported: false },
  sort: { supported: false },
  etag: { supported: true },
  authenticationSchemes: [
    {
      type: 'oauthbearertoken',
      name: 'OAuth Bearer Token',
      description: 'Bearer token authentication for tenant-scoped SCIM provisioning.',
      specUri: 'https://www.rfc-editor.org/rfc/rfc6750',
      primary: true,
    },
  ],
  meta: { resourceType: 'ServiceProviderConfig' },
})

const userSchema = () => ({
  id: USER_SCHEMA,
  name: 'User',
  description: 'User Account',
  schemas: [SCHEMA_SCHEMA],
  meta: { resourceType: 'Schema' },
  attributes: [
    { name: 'userName', type: 'string', multiValued: false, required: true, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'server' },
    { name: 'name', type: 'complex', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', subAttributes: [
      { name: 'givenName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none' },
      { name: 'familyName', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none' },
    ] },
    { name: 'active', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
    { name: 'emails', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default', subAttributes: [
      { name: 'value', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none' },
      { name: 'primary', type: 'boolean', multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
      { name: 'type', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', canonicalValues: ['work', 'home', 'other'] },
    ] },
    { name: 'groups', type: 'complex', multiValued: true, required: false, mutability: 'readOnly', returned: 'default', subAttributes: [
      { name: 'value', type: 'string', multiValued: false, required: false, mutability: 'readOnly', returned: 'default', uniqueness: 'none' },
      { name: '$ref', type: 'reference', referenceTypes: ['Group'], multiValued: false, required: false, mutability: 'readOnly', returned: 'default' },
      { name: 'display', type: 'string', multiValued: false, required: false, mutability: 'readOnly', returned: 'default' },
    ] },
  ],
})

const groupSchema = () => ({
  id: GROUP_SCHEMA,
  name: 'Group',
  description: 'Group',
  schemas: [SCHEMA_SCHEMA],
  meta: { resourceType: 'Schema' },
  attributes: [
    { name: 'displayName', type: 'string', multiValued: false, required: true, caseExact: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none' },
    { name: 'members', type: 'complex', multiValued: true, required: false, mutability: 'readWrite', returned: 'default', subAttributes: [
      { name: 'value', type: 'string', multiValued: false, required: false, mutability: 'readWrite', returned: 'default', uniqueness: 'none' },
      { name: '$ref', type: 'reference', referenceTypes: ['User', 'Group'], multiValued: false, required: false, mutability: 'readWrite', returned: 'default' },
      { name: 'display', type: 'string', multiValued: false, required: false, mutability: 'readOnly', returned: 'default' },
    ] },
  ],
})

const resourceTypes = () => [
  { schemas: [RESOURCE_TYPE_SCHEMA], id: 'User', name: 'User', endpoint: '/Users', description: 'User Account', schema: USER_SCHEMA, schemaExtensions: [], meta: { resourceType: 'ResourceType' } },
  { schemas: [RESOURCE_TYPE_SCHEMA], id: 'Group', name: 'Group', endpoint: '/Groups', description: 'Group', schema: GROUP_SCHEMA, schemaExtensions: [], meta: { resourceType: 'ResourceType' } },
]

const schemas = () => [userSchema(), groupSchema()]

const requireSafeConnectionIdParam = (req, res, next) => {
  if (!CONNECTION_ID_PATTERN.test(req.params.connectionId || '')) {
    return res.status(400).json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: '400', scimType: 'invalidValue', detail: 'Invalid SCIM connection identifier.' })
  }
  return next()
}

function registerScimRoutes({ secureRoute, filterMaxResults = DEFAULT_FILTER_MAX_RESULTS } = {}) {
  if (!secureRoute) throw new Error('secureRoute is required')
  const basePath = '/scim/v2/connections/:connectionId'
  secureRoute.get(`${basePath}/ServiceProviderConfig`, 'public', requireSafeConnectionIdParam, (req, res) => res.json(addLocation(req, serviceProviderConfig({ filterMaxResults }))))
  secureRoute.get(`${basePath}/ResourceTypes`, 'public', requireSafeConnectionIdParam, (req, res) => res.json(listResponse(resourceTypes().map((resourceType) => addLocation(req, resourceType, `${req.path}/${resourceType.id}`)))))
  secureRoute.get(`${basePath}/ResourceTypes/:resourceType`, 'public', requireSafeConnectionIdParam, (req, res) => {
    const resourceType = resourceTypes().find((candidate) => candidate.id.toLowerCase() === String(req.params.resourceType).toLowerCase())
    if (!resourceType) return res.status(404).json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: '404', detail: 'SCIM resource type not found.' })
    return res.json(addLocation(req, resourceType))
  })
  secureRoute.get(`${basePath}/Schemas`, 'public', requireSafeConnectionIdParam, (req, res) => res.json(listResponse(schemas().map((schema) => addLocation(req, schema, `${req.path}/${schema.id}`)))))
  secureRoute.get(`${basePath}/Schemas/:schemaId`, 'public', requireSafeConnectionIdParam, (req, res) => {
    const schema = schemas().find((candidate) => candidate.id === req.params.schemaId)
    if (!schema) return res.status(404).json({ schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'], status: '404', detail: 'SCIM schema not found.' })
    return res.json(addLocation(req, schema))
  })
}

module.exports = { DEFAULT_FILTER_MAX_RESULTS, GROUP_SCHEMA, USER_SCHEMA, registerScimRoutes, resourceTypes, schemas, serviceProviderConfig }
