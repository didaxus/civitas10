'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planDto, pageDto, profileDto } = require('../planning/application/dtos');

test('persistence plan aliases are normalized without leaking to the public DTO', () => {
  const dto = planDto({ planId:'p1', name:'Canonical title', planType:'curriculum', state:'draft', content:{ description:'Canonical description', privateField:true }, version:2, updatedAt:'2026-01-01T00:00:00Z' });
  assert.deepEqual(dto, { id:'p1', title:'Canonical title', planType:'curriculum', description:'Canonical description', status:'draft', version:'2', updatedAt:'2026-01-01T00:00:00Z' });
  assert.equal('name' in dto, false); assert.equal('configuration' in dto, false); assert.equal('content' in dto, false);
});

test('profile configuration aliases normalize to planningMode and preferences', () => {
  assert.deepEqual(profileDto({ organizationId:'org-1', configuration:{ planningMode:'strategic', preferences:{ fiscalYearStart:'07-01' } }, version:3, updatedAt:'2026-01-01T00:00:00Z' }), { organizationId:'org-1', planningMode:'strategic', preferences:{ fiscalYearStart:'07-01' }, version:'3', updatedAt:'2026-01-01T00:00:00Z' });
});

test('collection preserves opaque pagination returned by persistence', () => {
  const result = pageDto({ items:[], page:{ nextCursor:'opaque-token', hasMore:true }, links:{ next:'?cursor=opaque-token' }, meta:{} });
  assert.equal(result.page.nextCursor, 'opaque-token'); assert.equal(result.page.hasMore, true);
});
