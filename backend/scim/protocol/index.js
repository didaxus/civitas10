const crypto = require('node:crypto');

const SCIM_CONTENT_TYPE = 'application/scim+json';
const SCIM_ERROR_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:Error';
const LIST_RESPONSE_SCHEMA = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
const ALLOWED_FILTERS = Object.freeze(['userName', 'externalId', 'id', 'displayName']);
const FILTER_PATTERN = /^([A-Za-z][A-Za-z0-9_-]*)\s+([A-Za-z]+)\s+"((?:\\.|[^"\\])*)"$/;

class ScimProtocolError extends Error {
  constructor(status, detail, { scimType } = {}) {
    super(detail);
    this.name = 'ScimProtocolError';
    this.status = status;
    this.scimType = scimType;
  }
}

function createScimError(status, detail, scimType) {
  const error = { schemas: [SCIM_ERROR_SCHEMA], status: String(status), detail };
  if (scimType) error.scimType = scimType;
  return error;
}

function assertScimJsonContentType(contentType) {
  if (typeof contentType !== 'string') {
    throw new ScimProtocolError(415, 'Content-Type must be application/scim+json', { scimType: 'invalidSyntax' });
  }
  const [mediaType, ...params] = contentType.split(';').map((part) => part.trim().toLowerCase());
  const allowedParams = params.every((param) => param === 'charset=utf-8');
  if (mediaType !== SCIM_CONTENT_TYPE || !allowedParams) {
    throw new ScimProtocolError(415, 'Content-Type must be application/scim+json', { scimType: 'invalidSyntax' });
  }
}

function assertPayloadSize(payload, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) throw new TypeError('maxBytes must be a non-negative safe integer');
  const bytes = Buffer.isBuffer(payload) ? payload.byteLength : Buffer.byteLength(payload == null ? '' : String(payload));
  if (bytes > maxBytes) {
    throw new ScimProtocolError(413, `Payload exceeds ${maxBytes} bytes`, { scimType: 'tooLarge' });
  }
  return bytes;
}

function parsePositiveInteger(value, fallback, name, { allowZero = false } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const numeric = Number(value);
  const min = allowZero ? 0 : 1;
  if (!Number.isInteger(numeric) || numeric < min) {
    throw new ScimProtocolError(400, `${name} must be an integer greater than or equal to ${min}`, { scimType: 'invalidValue' });
  }
  return numeric;
}

function paginateScim(items, { startIndex = 1, count = 100 } = {}) {
  const safeStartIndex = parsePositiveInteger(startIndex, 1, 'startIndex');
  const safeCount = parsePositiveInteger(count, 100, 'count', { allowZero: true });
  const startOffset = safeStartIndex - 1;
  const Resources = items.slice(startOffset, startOffset + safeCount);
  return { schemas: [LIST_RESPONSE_SCHEMA], totalResults: items.length, startIndex: safeStartIndex, itemsPerPage: Resources.length, Resources };
}

function stableOrder(items, selectors = ['id']) {
  const normalizedSelectors = Array.isArray(selectors) ? selectors : [selectors];
  return [...items].sort((left, right) => {
    for (const selector of normalizedSelectors) {
      const leftValue = readSelector(left, selector);
      const rightValue = readSelector(right, selector);
      const comparison = String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'en', { sensitivity: 'base', numeric: true });
      if (comparison !== 0) return comparison;
    }
    return String(left.id ?? '').localeCompare(String(right.id ?? ''), 'en', { sensitivity: 'base', numeric: true });
  });
}

function readSelector(value, selector) {
  if (typeof selector === 'function') return selector(value);
  return String(selector).split('.').reduce((current, key) => current == null ? undefined : current[key], value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = canonicalize(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function generateEtag(resource) {
  const digest = crypto.createHash('sha256').update(JSON.stringify(canonicalize(resource))).digest('base64url');
  return `W/"${digest}"`;
}

function validateIfMatch(ifMatch, currentEtag) {
  if (!ifMatch) return true;
  const candidates = String(ifMatch).split(',').map((value) => value.trim());
  if (candidates.includes('*') || candidates.includes(currentEtag)) return true;
  throw new ScimProtocolError(412, 'ETag precondition failed', { scimType: 'mutability' });
}

function parseScimFilter(filter) {
  if (filter === undefined || filter === null || String(filter).trim() === '') return null;
  const match = String(filter).trim().match(FILTER_PATTERN);
  if (!match) throw invalidFilter('Filter must use the form: attribute eq "value"');
  const [, attribute, operator, rawValue] = match;
  if (!ALLOWED_FILTERS.includes(attribute)) throw invalidFilter(`Unsupported filter attribute: ${attribute}`);
  if (operator !== 'eq') throw invalidFilter(`Unsupported filter operator: ${operator}`);
  return { attribute, operator, value: unescapeFilterValue(rawValue) };
}

function invalidFilter(detail) {
  return new ScimProtocolError(400, detail, { scimType: 'invalidFilter' });
}

function unescapeFilterValue(value) {
  return value.replace(/\\(["\\/bfnrt])/g, (_, char) => ({ b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[char] ?? char));
}

module.exports = {
  ALLOWED_FILTERS,
  LIST_RESPONSE_SCHEMA,
  SCIM_CONTENT_TYPE,
  SCIM_ERROR_SCHEMA,
  ScimProtocolError,
  assertPayloadSize,
  assertScimJsonContentType,
  createScimError,
  generateEtag,
  paginateScim,
  parseScimFilter,
  stableOrder,
  validateIfMatch,
};
