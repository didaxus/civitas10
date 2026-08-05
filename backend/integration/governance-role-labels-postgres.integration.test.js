"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");
const { PostgresRoleLabelRepository, RoleLabelService, canonicalRoles } = require("../governance/role-labels");
const run = process.env.DATABASE_URL ? test : test.skip;
run("PostgreSQL role labels persist, version, audit, and isolate organizations", async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(fs.readFileSync(path.join(__dirname, "../db/migrations/0035_governance_role_labels.sql"), "utf8"));
    await pool.query("delete from governance_role_label_audit_events; delete from organization_role_aliases; delete from civitas_role_label_overrides; delete from civitas_role_label_versions where scope <> 'global'; update civitas_role_label_versions set version=0 where scope='global'");
    const roles = canonicalRoles().map((role, index) => ({ id: `pg-logto-${index}`, name: role.canonicalRoleKey }));
    const svc = new RoleLabelService({ repository: new PostgresRoleLabelRepository(pool) });
    let modelA = await svc.buildReadModel({ organizationId: "pg-org-a", roles, surface: "tenant" });
    await svc.updateGlobalLabel({ canonicalRoleKey: "organization_teacher", displayName: "Instructor", expectedVersion: modelA.globalVersion, actorLogtoUserId: "owner-pg", reason: "pg" });
    assert.equal((await svc.buildReadModel({ organizationId: "pg-org-b", roles, surface: "tenant" })).rows.find((row) => row.canonicalRoleKey === "organization_teacher").effectiveLabel, "Instructor");
    modelA = await svc.buildReadModel({ organizationId: "pg-org-a", roles, surface: "tenant" });
    await svc.updateOrganizationAlias({ organizationId: "pg-org-a", canonicalRoleKey: "organization_teacher", logtoRoleIdSnapshot: "pg-logto-5", displayName: "Academic Coach", expectedVersion: modelA.organizationVersion, actorLogtoUserId: "admin-pg", reason: "pg" });
    await svc.updateGlobalLabel({ canonicalRoleKey: "organization_teacher", displayName: "Faculty", expectedVersion: (await svc.buildReadModel({ organizationId: "pg-org-a", roles, surface: "owner" })).globalVersion, actorLogtoUserId: "owner-pg", reason: "pg" });
    assert.equal((await svc.buildReadModel({ organizationId: "pg-org-a", roles, surface: "tenant" })).rows.find((row) => row.canonicalRoleKey === "organization_teacher").effectiveLabel, "Academic Coach");
    assert.equal((await svc.buildReadModel({ organizationId: "pg-org-b", roles, surface: "tenant" })).rows.find((row) => row.canonicalRoleKey === "organization_teacher").effectiveLabel, "Faculty");
    const audit = await pool.query("select event_type from governance_role_label_audit_events order by id");
    assert.deepEqual(audit.rows.map((row) => row.event_type), ["governance.civitas_role_label.updated", "governance.organization_role_alias.updated", "governance.civitas_role_label.updated"]);
  } finally { await pool.end(); }
});
