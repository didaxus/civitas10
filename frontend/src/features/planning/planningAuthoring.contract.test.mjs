import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const api = fs.readFileSync(new URL("./planningApi.ts", import.meta.url), "utf8");
const ui = fs.readFileSync(new URL("./PlanningRemote.tsx", import.meta.url), "utf8");

test("Planning plans and profile use the public OpenAPI paths", () => {
  assert.match(api, /root\(organizationId\)\}\/plans/);
  assert.match(api, /root\(organizationId\)\}\/plans\/\$\{encodeURIComponent\(planId\)\}/);
  assert.match(api, /root\(organizationId\)\}\/profile/);
});

test("writes preserve concurrency and idempotency headers", () => {
  assert.match(api, /method: "PATCH"/);
  assert.match(api, /"If-Match": etag/);
  assert.match(api, /"Idempotency-Key": crypto\.randomUUID\(\)/);
});

test("the remote has one screen implementation and no incomplete handoff surface", () => {
  assert.equal((ui.match(/export function PlanningRemoteScreen/g) || []).length, 1);
  assert.doesNotMatch(ui, /usePlanningData|HandoffStatus|ProductionHandoffOperation|screen === "handoffs"|"roadmaps"/);
});
