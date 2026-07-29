const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");

const backend = readFileSync(require.resolve("../index.js"), "utf8");
const routes = readFileSync(require.resolve("../../frontend/src/navigation/routes.ts"), "utf8");
const app = readFileSync(require.resolve("../../frontend/src/pages/App/index.tsx"), "utf8");
const lifecycle = readFileSync(require.resolve("../../frontend/src/tenant/lifecycle.ts"), "utf8");

test("tenant handlers have no organization authority in route params", () => {
  const tenantHandlers = backend.split('secureRoute.get("/session/context"')[1].split("registerScimUserRoutes")[0];
  assert.doesNotMatch(tenantHandlers, /req\.params\.organizationId|\/o\/:organizationId/);
  assert.match(tenantHandlers, /tenantOrganizationId\(req\)/);
  assert.match(backend, /\/owner\/organizations\/:organizationId/);
});

test("neutral settings routes support deep links and guarded legacy redirects", () => {
  assert.doesNotMatch(routes, /\/o\/:organizationId\/settings/);
  assert.match(routes, /defineRoute\("\/settings\/governance\/organization-model\/structure"\)/);
  assert.match(app, /TenantContextProvider><LegacyTenantSettingsRedirect/);
});

test("tenant transition cancels requests and clears registered caches first", () => {
  assert.match(lifecycle, /generation\.abort/);
  assert.match(lifecycle, /for \(const invalidate of invalidators\) invalidate\(\)/);
});
