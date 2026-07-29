import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const apiSource = readFileSync(new URL('./planningApi.ts', import.meta.url), 'utf8');
const uiSource = readFileSync(new URL('./PlanningRemote.tsx', import.meta.url), 'utf8');
const contributionSource = readFileSync(new URL('./planningRemoteUiContribution.ts', import.meta.url), 'utf8');

test('menu, direct URLs and breadcrumbs register every Planning screen', () => {
  for (const id of ['planning.home', 'planning.plans.list', 'planning.plans.create', 'planning.plans.detail', 'planning.plans.edit', 'planning.profile']) {
    assert.match(contributionSource, new RegExp(`routeId: "${id.replaceAll('.', '\\.')}"`));
  }
  assert.equal((contributionSource.match(/parentRouteId:/g) || []).length, 5);
  assert.match(contributionSource, /route\("\/plans\/:planId"\)/);
});

test('typed client uses only organization-scoped public REST and contract methods', () => {
  assert.match(apiSource, /\/api\/v1\/o\/\$\{encodeURIComponent\(organizationId\)\}\/planning/);
  assert.match(apiSource, /plansRoot\(organizationId\)/);
  assert.match(apiSource, /method: "PATCH"/);
  assert.match(apiSource, /"If-Match": etag/);
  assert.match(apiSource, /"Idempotency-Key": crypto\.randomUUID\(\)/);
  assert.doesNotMatch(apiSource, /private\/planning-runtime|Authorization|decodeJwt|role/);
});

test('organization switch clears every tenant-owned view before refetch', () => {
  assert.match(uiSource, /setPlans\(\[\]\); setPlan\(null\); setProfile\(null\)/);
  assert.match(uiSource, /return \(\) => controller\.abort\(\)/);
});

test('conflict, degraded, unavailable and bundle failure states are explicit and accessible', () => {
  assert.match(uiSource, /error\?\.status === 412/);
  assert.match(uiSource, /degraded read-only mode/);
  assert.match(uiSource, /availability === "unavailable"/);
  assert.match(uiSource, /PlanningBundleFailureFallback/);
  assert.match(uiSource, /role="alert"/);
  assert.match(uiSource, /aria-live="polite"/);
  assert.match(uiSource, /civitas-responsive-table/);
});

test('profile replacement and plan updates carry optimistic concurrency', () => {
  assert.match(apiSource, /replaceProfile:[\s\S]*"If-Match": etag/);
  assert.match(uiSource, /data\.profile\.etag \|\| data\.profile\.version/);
  assert.match(uiSource, /data\.plan\.etag \|\| data\.plan\.version/);
});
