import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./PlanningRoute.tsx", import.meta.url), "utf8");
const remoteSource = readFileSync(new URL("./PlanningRemote.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./planningApi.ts", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("./planningRegistry.ts", import.meta.url), "utf8");
const decisionSource = readFileSync(new URL("./planningAccessDecision.ts", import.meta.url), "utf8");
const fallbackSource = readFileSync(new URL("./PlanningAccessFallback.tsx", import.meta.url), "utf8");

test("Planning contribution uses the canonical Screen/Action adapter", () => {
  assert.match(registrySource, /adaptValidatedModuleUiContribution/);
  assert.match(registrySource, /planningRemoteUiContribution/);
});
test("navigation, direct URLs and breadcrumbs remain organization scoped", () => {
  assert.match(routeSource, /buildModuleUiBreadcrumbs/); assert.match(routeSource, /organizationId/);
});
test("organization changes abort old requests and every cache key contains the organization", () => {
  for (const factory of ["plans", "plan", "profile"]) assert.match(apiSource, new RegExp(`${factory}: \\(organizationId`));
  assert.match(decisionSource, /context\.organizationId !== organizationId/); assert.match(remoteSource, /orgRef\.current !== organizationId/);
});
test("only the public organization Planning API is consumed", () => {
  assert.match(apiSource, /\/api\/v1\/o\/\$\{encodeURIComponent\(organizationId\)\}\/planning/); assert.doesNotMatch(apiSource, /private[-_]runtime|runtime\/planning/i);
});
test("all access states, keyboard focus and accessible semantics are present", () => {
  for (const state of ["loading", "denied", "unavailable", "incompatible"]) assert.match(fallbackSource, new RegExp(state));
  assert.match(remoteSource, /No planning records yet/); assert.match(remoteSource, /degraded read-only mode/); assert.match(routeSource, /tabIndex=\{-1\}/); assert.match(routeSource, /aria-label="Breadcrumb"/); assert.match(remoteSource, /ref\.current\?\.focus/); assert.match(remoteSource, /aria-live="polite"/);
});
test("canonical AuthorizationContext—not an uncontracted access endpoint—controls mounting", () => {
  assert.match(routeSource, /useVisualAuthorization/); assert.match(decisionSource, /evaluateScreenEligibility/);
  assert.doesNotMatch(apiSource, /getUiAccess|ui-access/); assert.doesNotMatch(routeSource, /jwt|claim|dimension|userRoles|hasRole/i);
});

test("all Planning URLs share the planning/plans route root and use router navigation", () => { assert.match(routeSource, /planning\/plans/); assert.match(remoteSource, /useNavigate/); assert.match(remoteSource, /<Link/); assert.doesNotMatch(remoteSource, /<a\s|href=/); });
test("create navigates to returned resource and profile replacement preserves ETag", () => { assert.match(remoteSource, /created\.planId/); assert.match(remoteSource, /profile\.etag \|\| profile\.version/); assert.match(apiSource, /"If-Match": etag/); });
test("route screen and action lifecycle statuses stay planned", () => { assert.equal((contributionSource.match(/status: "planned"/g) || []).length, 8); });
test("build hashes the emitted Planning artifact bytes", () => { assert.match(viteSource, /artifact\.code/); assert.match(viteSource, /createHash\("sha256"\)/); assert.match(viteSource, /planning-bundle-integrity\.json/); });
