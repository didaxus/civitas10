const test = require("node:test");
const assert = require("node:assert/strict");
const { requirePermission } = require("../middleware/requirePermission");
const { requireSeats } = require("../middleware/requireSeats");
const { GLOBAL_ROLES, ORGANIZATION_ROLES } = require("../authorization/roles");
function res() { return { statusCode: null, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }


test("organization roles match verified Logto role names", () => {
  assert.deepEqual(Object.values(ORGANIZATION_ROLES), [
    "organization_accountant",
    "organization_admin",
    "organization_billing",
    "organization_director",
    "organization_headdirector",
    "organization_headteacher",
    "organization_groupleader",
    "organization_member",
    "organization_parent",
    "organization_payroll",
    "organization_secretary",
    "organization_student",
    "organization_teacher",
  ]);
});

test("scope present allows access", () => { const r = res(); let called = false; requirePermission("org.documents.read")({ auth: { scopes: new Set(["org.documents.read"]) } }, r, () => { called = true; }); assert.equal(called, true); });
test("scope absent denies even for owner_global", () => { const r = res(); requirePermission("owner.organizations.read")({ auth: { scopes: new Set(), globalRoles: [GLOBAL_ROLES.OWNER] } }, r, () => assert.fail("next should not be called")); assert.equal(r.statusCode, 403); assert.equal(r.body.requiredPermission, "owner.organizations.read"); });
test("organization role without scope cannot grant permission", () => { const r = res(); requirePermission("org.documents.create")({ auth: { scopes: new Set(), organizationRoles: [ORGANIZATION_ROLES.ADMIN] } }, r, () => assert.fail("next should not be called")); assert.equal(r.statusCode, 403); });
test("missing user returns 401", () => { const r = res(); requirePermission("org.documents.read")({}, r, () => assert.fail("next should not be called")); assert.equal(r.statusCode, 401); });
test("wildcard and legacy permission registration fails", () => { assert.throws(() => requirePermission("*")); assert.throws(() => requirePermission("owner:read")); assert.throws(() => requirePermission("organization.members.write")); assert.throws(() => requirePermission("org.impersonate")); });
test("all and any permission helpers use scope-only semantics", () => { const { requireAllPermissions, requireAnyPermission } = require("../middleware/requirePermission"); const r1 = res(); let allCalled = false; requireAllPermissions(["org.documents.read", "org.documents.create"])({ auth: { scopes: new Set(["org.documents.read", "org.documents.create"]) } }, r1, () => { allCalled = true; }); assert.equal(allCalled, true); const r2 = res(); let anyCalled = false; requireAnyPermission(["org.documents.create", "org.documents.read"])({ auth: { scopes: new Set(["org.documents.read"]) } }, r2, () => { anyCalled = true; }); assert.equal(anyCalled, true); });
test("requireSeats without req.org returns 500", async () => { const r = res(); await requireSeats({}, r, () => assert.fail("next should not be called")); assert.equal(r.statusCode, 500); assert.match(r.body.detail, /requireOrg/); });
test("requireSeats with no seats available returns 422 with action", async () => { const r = res(); await requireSeats({ org: { seats_total: 3, seats_used: 3, seats_available: 0 } }, r, () => assert.fail("next should not be called")); assert.equal(r.statusCode, 422); assert.ok(r.body.action); });
test("requireSeats with seats available calls next", async () => { const r = res(); let called = false; const req = { org: { seats_total: 3, seats_used: 1, seats_available: 2 } }; await requireSeats(req, r, () => { called = true; }); assert.equal(called, true); });

test("requireOrg with suspended org returns 403 with action", async () => {
  const dbPath = require.resolve("../lib/db");
  const requireOrgPath = require.resolve("../middleware/requireOrg");
  const originalDb = require.cache[dbPath];
  delete require.cache[requireOrgPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { queryPostgres: async () => ({ rows: [{ id: "org-1", logto_organization_id: "logto-org-1", status: "suspended", plan: "basic", seats_total: 1, seats_used: 0 }] }) },
  };
  const { requireOrg } = require("../middleware/requireOrg");
  const r = res();
  await requireOrg({ user: { organizationId: "org-1" }, params: { id: "org-1" } }, r, () => assert.fail("next should not be called"));
  assert.equal(r.statusCode, 403);
  assert.ok(r.body.action);
  delete require.cache[requireOrgPath];
  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
});

test("canonical middleware chain reaches handler", async () => {
  const calls = [];
  const requireAuth = (req, _res, next) => { req.auth = { scopes: new Set(["org.documents.read"]) }; req.user = { scopes: ["org.documents.read"], roles: [GLOBAL_ROLES.OWNER] }; calls.push("auth"); next(); };
  const requireOrg = (req, _res, next) => { req.org = { id: "org-1", seats_total: 2, seats_used: 1, seats_available: 1 }; calls.push("org"); next(); };
  const permission = requirePermission("org.documents.read");
  const r = res();
  const req = {};
  await new Promise((resolve) => requireAuth(req, r, resolve));
  await new Promise((resolve) => requireOrg(req, r, resolve));
  await new Promise((resolve) => permission(req, r, resolve));
  await new Promise((resolve) => requireSeats(req, r, resolve));
  calls.push("handler");
  assert.deepEqual(calls, ["auth", "org", "handler"]);
});

test("requireOrg rejects token/request organization mismatch", async () => {
  const { requireOrg } = require("../middleware/requireOrg");
  const r = res();
  await requireOrg({ user: { organizationId: "org-A" }, params: { organizationId: "org-B" } }, r, () => assert.fail("next should not be called"));
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error, "organization_context_mismatch");
  assert.deepEqual(r.body, { error: "organization_context_mismatch" });
});

test("requireOrg never treats a route parameter as tenant authority", async () => {
  const { requireOrg } = require("../middleware/requireOrg");
  const r = res();
  await requireOrg({ params: { organizationId: "org-route-only" } }, r, () => assert.fail("next should not be called"));
  assert.equal(r.statusCode, 400);
  assert.equal(r.body.error, "organization_context_required");
});

test("requireOrg with tenant token and no param uses token organization", async () => {
  const dbPath = require.resolve("../lib/db");
  const requireOrgPath = require.resolve("../middleware/requireOrg");
  const originalDb = require.cache[dbPath];
  delete require.cache[requireOrgPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { queryPostgres: async (_query, params) => {
      assert.deepEqual(params, ["org-A"]);
      return { rows: [{ id: "tenant-A", logto_organization_id: "org-A", status: "active", plan: "basic", seats_total: 3, seats_used: 1 }] };
    } },
  };
  const { requireOrg } = require("../middleware/requireOrg");
  const r = res();
  const req = { user: { organizationId: "org-A" }, params: {} };
  let called = false;
  await requireOrg(req, r, () => { called = true; });
  assert.equal(called, true);
  assert.equal(req.org.logto_organization_id, "org-A");
  assert.equal(req.org.seats_available, 2);
  delete require.cache[requireOrgPath];
  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
});

test("requireOrg rejects resolved organization that differs from token", async () => {
  const dbPath = require.resolve("../lib/db");
  const requireOrgPath = require.resolve("../middleware/requireOrg");
  const originalDb = require.cache[dbPath];
  delete require.cache[requireOrgPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { queryPostgres: async () => ({ rows: [{ id: "tenant-B", logto_organization_id: "org-B", status: "active", plan: "basic", seats_total: 1, seats_used: 0 }] }) },
  };
  const { requireOrg } = require("../middleware/requireOrg");
  const r = res();
  await requireOrg({ user: { organizationId: "org-A" }, params: {} }, r, () => assert.fail("next should not be called"));
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error, "organization_context_mismatch");
  delete require.cache[requireOrgPath];
  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
});

test("requireOrg with cancelled org returns 403 with action", async () => {
  const dbPath = require.resolve("../lib/db");
  const requireOrgPath = require.resolve("../middleware/requireOrg");
  const originalDb = require.cache[dbPath];
  delete require.cache[requireOrgPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: { queryPostgres: async () => ({ rows: [{ id: "org-1", logto_organization_id: "logto-org-1", status: "cancelled", plan: "basic", seats_total: 1, seats_used: 0 }] }) },
  };
  const { requireOrg } = require("../middleware/requireOrg");
  const r = res();
  await requireOrg({ user: { organizationId: "logto-org-1" }, params: {} }, r, () => assert.fail("next should not be called"));
  assert.equal(r.statusCode, 403);
  assert.equal(r.body.error, "organization_cancelled");
  assert.ok(r.body.action);
  delete require.cache[requireOrgPath];
  if (originalDb) require.cache[dbPath] = originalDb;
  else delete require.cache[dbPath];
});
