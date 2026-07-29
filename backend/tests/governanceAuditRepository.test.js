const test = require("node:test");
const assert = require("node:assert/strict");
const { GovernanceAuditRepository } = require("../services/governanceAuditRepository");

test("cursor is stable and history is immutable", () => {
  let n = 0; const repo = new GovernanceAuditRepository({ clock: () => new Date("2026-01-01T00:00:00Z"), id: () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}` });
  const tenant = repo.tenant("org-a"); tenant.append({ operation: "a" }); tenant.append({ operation: "b" }); tenant.append({ operation: "c" });
  const first = tenant.list({ limit: 2 }); assert.equal(first.events.length, 2); assert.ok(first.nextCursor);
  tenant.append({ operation: "new" });
  const second = tenant.list({ limit: 2, cursor: first.nextCursor }); assert.deepEqual(second.events.map((e) => e.operation), ["a"]);
  first.events[0].operation = "changed"; assert.notEqual(first.events[0].operation, "changed");
});

test("redacts forbidden material and does not leak targets or tenants", () => {
  const repo = new GovernanceAuditRepository();
  repo.tenant("org-a").append({ actorId: "person@example.test", operation: "planning.plan.updated.v1", targetType: "plan", targetId: "hidden-plan", after: { email: "person@example.test", headers: { authorization: "Bearer secret" }, note: "eyJabc.def.ghi" } });
  const text = JSON.stringify(repo.tenant("org-a").list());
  for (const secret of ["person@example.test", "hidden-plan", "Bearer secret", "eyJabc.def.ghi"]) assert.equal(text.includes(secret), false);
  assert.equal(repo.tenant("org-b").list().events.length, 0);
});

test("retention tombstone and capability-protected self-auditing export", () => {
  const repo = new GovernanceAuditRepository(); const tenant = repo.tenant("org-a"); const event = tenant.append({ operation: "changed" });
  assert.equal(repo.expire("org-a", event.eventId), true); assert.equal(tenant.detail(event.eventId).status, "retention_expired");
  assert.throws(() => tenant.export({ capabilityGranted: false }), /capability_required/);
  tenant.append({ operation: "changed-again" }); const exported = tenant.export({ capabilityGranted: true, actorId: "admin" });
  assert.equal(tenant.detail(exported.auditEventId).event.operation, "governance.audit.exported");
});
