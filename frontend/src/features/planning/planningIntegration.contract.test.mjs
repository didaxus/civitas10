import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const routeSource = readFileSync(new URL("./PlanningRoute.tsx", import.meta.url), "utf8");
const remoteSource = readFileSync(new URL("./PlanningRemote.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./planningApi.ts", import.meta.url), "utf8");
const registrySource = readFileSync(new URL("./planningRegistry.ts", import.meta.url), "utf8");

test("Planning contribution uses the canonical Screen/Action adapter", () => {
  assert.match(registrySource, /adaptValidatedModuleUiContribution/);
  assert.match(registrySource, /planningRemoteUiContribution/);
});
test("navigation, direct URLs and breadcrumbs remain organization scoped", () => {
  assert.match(routeSource, /buildModuleUiBreadcrumbs/); assert.match(routeSource, /organizationId/);
});
test("organization changes abort old requests and every cache key contains the organization", () => {
  for (const factory of ["access", "plans", "plan", "profile"]) assert.match(apiSource, new RegExp(`${factory}: \\(organizationId`));
  assert.match(routeSource, /controller\.abort/); assert.match(remoteSource, /orgRef\.current !== organizationId/);
});
test("only the public organization Planning API is consumed", () => {
  assert.match(apiSource, /\/api\/v1\/o\/\$\{encodeURIComponent\(organizationId\)\}\/planning/); assert.doesNotMatch(apiSource, /private[-_]runtime|runtime\/planning/i);
});
test("all states, keyboard focus and accessible semantics are present", () => {
  for (const state of ["loading", "forbidden", "unavailable", "conflict", "error"]) assert.match(routeSource, new RegExp(state));
  assert.match(remoteSource, /No planning records yet/); assert.match(remoteSource, /degraded read-only mode/); assert.match(routeSource, /tabIndex=\{-1\}/); assert.match(routeSource, /aria-label="Breadcrumb"/); assert.match(remoteSource, /ref\.current\?\.focus/); assert.match(remoteSource, /aria-live="polite"/);
});
test("backend decisions—not roles, JWT claims or dimensions—control mounting", () => {
  assert.match(routeSource, /access\.authorization\.allowed/); assert.match(routeSource, /access\.availability\.executable/); assert.doesNotMatch(routeSource, /jwt|claim|dimension|userRoles|hasRole/i);
});
