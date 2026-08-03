'use strict';

// These are the executable counterparts of the request schemas in
// contracts/openapi/modules/planning.yaml. Keeping route validation declarative
// prevents controllers from accumulating a second, manual contract.
const stringId = Object.freeze({ type: 'string', minLength: 1, maxLength: 128, pattern: /^[A-Za-z0-9_-]+$/ });
const schemas = Object.freeze({
  organizationParams: { type: 'object', required: ['organizationId'], properties: { organizationId: stringId } },
  planParams: { type: 'object', required: ['organizationId', 'planId'], properties: { organizationId: stringId, planId: stringId } },
  createPlan: { type: 'object', required: ['title', 'planType'], additionalProperties: false, properties: { title: { type: 'string', minLength: 1, maxLength: 160 }, planType: { enum: ['strategic', 'tactical', 'operational', 'project', 'curriculum'] }, description: { type: ['string', 'null'], maxLength: 4000 } } },
  updatePlan: { type: 'object', minProperties: 1, additionalProperties: false, properties: { title: { type: 'string', minLength: 1, maxLength: 160 }, description: { type: ['string', 'null'], maxLength: 4000 } } },
  replaceProfile: { type: 'object', required: ['planningMode', 'preferences'], additionalProperties: false, properties: { planningMode: { enum: ['standard', 'curriculum', 'strategic'] }, preferences: { type: 'object', additionalProperties: false, properties: { fiscalYearStart: { type: 'string', pattern: /^[0-9]{2}-[0-9]{2}$/ } } } } },
  listQuery: { type: 'object', additionalProperties: false, properties: { cursor: { type: 'string', maxLength: 512 }, limit: { type: 'integer', minimum: 1, maximum: 100 }, status: { enum: ['draft', 'in_review', 'changes_requested', 'approved', 'archived'] } } },
  idempotencyHeaders: { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 8, maxLength: 255 } } },
  concurrencyHeaders: { type: 'object', required: ['if-match'], properties: { 'if-match': { type: 'string', minLength: 1, maxLength: 128 } } },
});

function types(schema) { return Array.isArray(schema.type) ? schema.type : [schema.type]; }
function validate(schema, value, path = '') {
  const errors = [];
  const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
  if (schema.type && !types(schema).includes(actual)) return [{ field: path || 'request', code: `type_${types(schema).join('_or_')}` }];
  if (schema.enum && !schema.enum.includes(value)) errors.push({ field: path, code: 'enum' });
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push({ field: path, code: 'minLength' });
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push({ field: path, code: 'maxLength' });
    if (schema.pattern && !schema.pattern.test(value)) errors.push({ field: path, code: 'pattern' });
  }
  if (typeof value === 'number') {
    if (schema.type === 'integer' && !Number.isInteger(value)) errors.push({ field: path, code: 'integer' });
    if (schema.minimum !== undefined && value < schema.minimum) errors.push({ field: path, code: 'minimum' });
    if (schema.maximum !== undefined && value > schema.maximum) errors.push({ field: path, code: 'maximum' });
  }
  if (actual === 'object') {
    for (const key of schema.required || []) if (value[key] === undefined) errors.push({ field: path ? `${path}.${key}` : key, code: 'required' });
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) errors.push({ field: path || 'body', code: 'minProperties' });
    if (schema.additionalProperties === false) for (const key of Object.keys(value)) if (!schema.properties?.[key]) errors.push({ field: path ? `${path}.${key}` : key, code: 'additionalProperty' });
    for (const [key, child] of Object.entries(schema.properties || {})) if (value[key] !== undefined) errors.push(...validate(child, value[key], path ? `${path}.${key}` : key));
  }
  return errors;
}

module.exports = { schemas, validate };
