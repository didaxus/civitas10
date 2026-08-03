'use strict'

const { provisionableRoleScopes } = require('./generated/role-model')

module.exports = Object.freeze(Object.fromEntries(Object.entries(provisionableRoleScopes).map(([roleKey, scopes]) => [roleKey, Object.freeze([...scopes].sort())])))
