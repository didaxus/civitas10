const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const source = readFileSync(join(__dirname, '../index.js'), 'utf8');

test('owner and tenant governance read-model endpoints are mounted and protected', () => {
  assert.match(source, /secureRoute\.get\("\/owner\/organizations\/:organizationId\/governance", "ownerRead", requireGlobalAccess\(\{ resource: API_RESOURCE, requiredScopes: \[OWNER_AUTHZ\.ownerProfileRead\] \}\), requireGlobalOwner, requireSafeOrganizationIdParam/);
  assert.match(source, /secureRoute\.get\("\/o\/:organizationId\/governance", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess\(\{ requiredAllScopes: \[ORG_AUTHZ\.documentsRead\] \}\), requireOrg, requireOrganizationRole\(SHARED_AUTH\.organization\.roles\.member\), requirePermission\(ORG_AUTHZ\.documentsRead\)/);
  assert.match(source, /assertTenantRouteMatchesContext\(req\)/);
});

test('governance roles mutation endpoints are mounted and protected separately', () => {
  assert.match(source, /secureRoute\.put\("\/owner\/organizations\/:organizationId\/governance\/entitlement-ceilings", "ownerSensitiveWrite", requireGlobalAccess\(\{ resource: API_RESOURCE, requiredScopes: \[OWNER_AUTHZ\.ownerRuntimeOperationsExecute\] \}\), requireGlobalOwner/);
  assert.match(source, /secureRoute\.put\("\/o\/:organizationId\/governance\/role-activations", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess\(\{ requiredAllScopes: \[ORG_AUTHZ\.documentsCreate\] \}\), requireOrg, requireOrganizationRole\(SHARED_AUTH\.organization\.roles\.admin\), requirePermission\(ORG_AUTHZ\.documentsCreate\)/);
  assert.match(source, /secureRoute\.post\("\/o\/:organizationId\/governance\/member-role-assignments", "organizationAdminWrite"/);
});

test('taxonomy units and data-scope owning endpoints are mounted and organization protected', () => {
  assert.match(source, /secureRoute\.post\("\/o\/:organizationId\/governance\/taxonomy\/values", "organizationAdminWrite"/);
  assert.match(source, /secureRoute\.post\("\/o\/:organizationId\/governance\/taxonomy\/publish", "organizationAdminWrite"/);
  assert.match(source, /secureRoute\.post\("\/o\/:organizationId\/governance\/units", "organizationAdminWrite"/);
  assert.match(source, /secureRoute\.post\("\/o\/:organizationId\/governance\/data-scopes", "organizationAdminWrite"/);
});

test('aliases navigation, access preview and audit endpoints are mounted and protected', () => {
  assert.match(source, /secureRoute\.post\("\/owner\/organizations\/:organizationId\/access-preview", "ownerRead"/);
  assert.match(source, /secureRoute\.post\("\/o\/:organizationId\/access-preview", "organizationMemberRead"/);
  assert.match(source, /secureRoute\.put\("\/o\/:organizationId\/governance\/navigation-preferences", "organizationAdminWrite"/);
  assert.match(source, /secureRoute\.get\("\/owner\/organizations\/:organizationId\/governance\/audit", "ownerRead"/);
  assert.match(source, /secureRoute\.get\("\/o\/:organizationId\/governance\/audit", "organizationMemberRead"/);
});

test('identity federation governance surfaces are mounted as planned and protected by existing governance authz', () => {
  assert.match(source, /secureRoute\.get\("\/owner\/organizations\/:organizationId\/governance\/identity", "ownerRead", requireGlobalAccess\(\{ resource: API_RESOURCE, requiredScopes: \[OWNER_AUTHZ\.ownerProfileRead\] \}\), requireGlobalOwner, requireSafeOrganizationIdParam/);
  assert.match(source, /secureRoute\.get\("\/o\/:organizationId\/settings\/governance\/identity", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess\(\{ requiredAllScopes: \[ORG_AUTHZ\.documentsRead\] \}\), requireOrg, requireOrganizationRole\(SHARED_AUTH\.organization\.roles\.admin\), requirePermission\(ORG_AUTHZ\.documentsRead\)/);
  assert.match(source, /identity_federation_handlers_policies_and_tests_pending/);
});

test('role label mutation endpoints preserve separate owner and organization authorization', () => {
  assert.match(source, /secureRoute\.put\("\/owner\/governance\/role-labels\/:canonicalRoleKey", "ownerSensitiveWrite", requireGlobalAccess\(\{ resource: API_RESOURCE, requiredScopes: \[OWNER_AUTHZ\.ownerRoleLabelsManage\] \}\), requireGlobalOwner/);
  assert.match(source, /secureRoute\.put\("\/o\/:organizationId\/governance\/role-aliases\/:canonicalRoleKey", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess\(\{ requiredAllScopes: \["org\.role_aliases\.manage"\] \}\), requireOrg, requireOrganizationRole\(SHARED_AUTH\.organization\.roles\.admin\), requirePermission\("org\.role_aliases\.manage"\)/);
  const ownerEndpoint = source.slice(source.indexOf('/owner/governance/role-labels/:canonicalRoleKey'), source.indexOf('/owner/organizations/:organizationId/governance/entitlement-ceilings'));
  const organizationEndpoint = source.slice(source.indexOf('/o/:organizationId/governance/role-aliases/:canonicalRoleKey'), source.indexOf('/o/:organizationId/governance/navigation-preferences'));
  assert.match(ownerEndpoint, /updateGlobalLabel/);
  assert.doesNotMatch(ownerEndpoint, /updateOrganizationAlias/);
  assert.match(organizationEndpoint, /updateOrganizationAlias/);
  assert.doesNotMatch(organizationEndpoint, /updateGlobalLabel/);
});
