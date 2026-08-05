import test from "node:test";
import assert from "node:assert/strict";
import sharedContract from "../../../dist/shared.contract.json" with { type: "json" };

const oidcLoginScopes = ["openid", "profile", "email"];
const ownerShellRequiredScopes = [
  sharedContract.auth.global.permissions.ownerProfileRead,
  sharedContract.auth.global.permissions.ownerOrganizationsRead,
  sharedContract.auth.global.permissions.ownerOrganizationsCreate,
  sharedContract.auth.global.permissions.ownerRuntimeRead,
  sharedContract.auth.global.permissions.ownerWorkerQueuesRead,
  sharedContract.auth.global.permissions.ownerRoleLabelsManage,
];
const logtoOwnerShellScopes = [...oidcLoginScopes, ...ownerShellRequiredScopes];

test("owner shell scope data matches the compiled shared contract", () => {
  assert.deepEqual(logtoOwnerShellScopes, [
    "openid",
    "profile",
    "email",
    "owner.profile.read",
    "owner.organizations.read",
    "owner.organizations.create",
    "owner.runtime.read",
    "owner.worker_queues.read",
    "owner.role_labels.manage",
  ]);
});

test("simulated Logto authorize parameters include global owner scopes and Civitas API resource", () => {
  const authorizeParams = new URLSearchParams({
    client_id: "spa-app",
    redirect_uri: "https://civitas.didaxus.com/callback",
    response_type: "code",
    scope: logtoOwnerShellScopes.join(" "),
    resource: sharedContract.logto.apiResource,
  });
  assert.equal(authorizeParams.get("resource"), "https://civitas.didaxus.com/api");
  assert.deepEqual(authorizeParams.get("scope")?.split(" "), logtoOwnerShellScopes);
});

test("token diagnostic model distinguishes empty scope from complete owner scopes", () => {
  const emptyTokenScopes = "".split(/\s+/).filter(Boolean);
  const completeTokenScopes = ownerShellRequiredScopes;
  assert.deepEqual(ownerShellRequiredScopes.filter((scope) => !emptyTokenScopes.includes(scope)), ownerShellRequiredScopes);
  assert.deepEqual(ownerShellRequiredScopes.filter((scope) => !completeTokenScopes.includes(scope)), []);
});

test("owner role-label management scope flows from shared contract into Logto shell scopes", () => {
  assert.equal(sharedContract.auth.global.permissions.ownerRoleLabelsManage, "owner.role_labels.manage");
  assert.ok(ownerShellRequiredScopes.includes("owner.role_labels.manage"));
  assert.ok(logtoOwnerShellScopes.includes("owner.role_labels.manage"));
});
