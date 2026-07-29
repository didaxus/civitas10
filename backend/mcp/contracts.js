'use strict';

const PRINCIPAL_SCHEMA_VERSION = 'civitas.mcp.principal/v1';
const DELEGATION_SCHEMA_VERSION = 'civitas.mcp.delegation-chain/v1';
const CONSENT_SCHEMA_VERSION = 'civitas.mcp.consent/v1';
const PRINCIPAL_TYPES = Object.freeze(['user', 'agent', 'system']);

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} is required`);
  return value.trim();
}

function validateDelegationChain(chain, principal, now = new Date()) {
  if (!chain) return Object.freeze({ schemaVersion: DELEGATION_SCHEMA_VERSION, links: [] });
  if (chain.schemaVersion !== DELEGATION_SCHEMA_VERSION || !Array.isArray(chain.links)) throw new TypeError('invalid delegation chain schema');
  let expected = principal.authenticatedClientId;
  const links = chain.links.map((link, index) => {
    const delegatorId = requiredString(link.delegatorId, `delegation.links[${index}].delegatorId`);
    const delegateId = requiredString(link.delegateId, `delegation.links[${index}].delegateId`);
    if (index === 0 && delegateId !== expected) throw new TypeError('delegation chain is not bound to authenticated client');
    if (index > 0 && delegateId !== chain.links[index - 1].delegatorId) throw new TypeError('delegation chain is discontinuous');
    if (Date.parse(link.expiresAt) <= now.getTime()) throw new TypeError('delegation link expired');
    return Object.freeze({ ...link, delegatorId, delegateId, permissions: Object.freeze([...(link.permissions || [])]), riskCeiling: requiredString(link.riskCeiling, 'riskCeiling') });
  });
  return Object.freeze({ schemaVersion: DELEGATION_SCHEMA_VERSION, links: Object.freeze(links) });
}

function validatePrincipal(value, now = new Date()) {
  if (value?.schemaVersion !== PRINCIPAL_SCHEMA_VERSION || !PRINCIPAL_TYPES.includes(value?.type)) throw new TypeError('invalid principal schema');
  const principal = { schemaVersion: PRINCIPAL_SCHEMA_VERSION, type: value.type, subjectId: requiredString(value.subjectId, 'subjectId'), authenticatedClientId: requiredString(value.authenticatedClientId, 'authenticatedClientId'), tenantId: requiredString(value.tenantId, 'tenantId') };
  if (value.type === 'user' && principal.subjectId !== principal.authenticatedClientId) throw new TypeError('user principal client must equal subject');
  principal.delegation = validateDelegationChain(value.delegation, principal, now);
  return Object.freeze(principal);
}

function validateConsent(value, binding, now = new Date()) {
  if (value?.schemaVersion !== CONSENT_SCHEMA_VERSION) throw new TypeError('invalid consent schema');
  for (const field of ['principalId', 'tenantId', 'toolId', 'toolVersion', 'argumentDigest', 'nonce', 'expiresAt']) requiredString(value[field], field);
  for (const field of ['principalId', 'tenantId', 'toolId', 'toolVersion', 'argumentDigest']) if (value[field] !== binding[field]) throw new TypeError(`consent ${field} mismatch`);
  if (Date.parse(value.expiresAt) <= now.getTime()) throw new TypeError('consent expired');
  return Object.freeze({ ...value });
}

module.exports = { PRINCIPAL_SCHEMA_VERSION, DELEGATION_SCHEMA_VERSION, CONSENT_SCHEMA_VERSION, PRINCIPAL_TYPES, validatePrincipal, validateDelegationChain, validateConsent };
