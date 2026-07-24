import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = readFileSync(new URL('./OwnerOrganizationsPage.tsx', import.meta.url), 'utf8');

test('owner onboarding copy distinguishes legacy JIT default role from identity federation mappings', () => {
  assert.match(source, /Legacy JIT domain default role \(not federation\)/);
  assert.match(source, /does not map external IdP claims, SCIM groups or Organization Identity Federation assignments/);
  assert.match(source, /Legacy JIT default role \(no external claim\/group mapping\)/);
});
