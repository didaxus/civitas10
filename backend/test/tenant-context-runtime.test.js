const test = require("node:test");
const assert = require("node:assert/strict");
const { parseHostnameBindings, resolveTenantContext } = require("../middleware/tenantContext");

const bindings = parseHostnameBindings({ "alpha.example.test": "org_alpha", "beta.example.test": "org_beta" });

test("hostname is authoritative and browser parameters are not inputs", () => {
  const result = resolveTenantContext({ hostname: "ALPHA.example.test:443", sessionOrganizationId: "org_alpha", subject: "user-1", bindings });
  assert.equal(result.ok, true);
  assert.equal(result.context.organizationId, "org_alpha");
  assert.equal(result.context.hostname, "alpha.example.test");
  assert.equal(Object.isFrozen(result.context), true);
});

test("rejects hostname confusion and a session bound to another tenant without disclosure", () => {
  assert.deepEqual(resolveTenantContext({ hostname: "unknown.example.test", sessionOrganizationId: "org_alpha", bindings }), { ok: false, status: 404, code: "TENANT_CONTEXT_NOT_FOUND" });
  assert.deepEqual(resolveTenantContext({ hostname: "alpha.example.test", sessionOrganizationId: "org_beta", bindings }), { ok: false, status: 403, code: "TENANT_SESSION_MISMATCH" });
});
