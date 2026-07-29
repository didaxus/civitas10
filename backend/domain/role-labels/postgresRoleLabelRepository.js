"use strict";

const { aliasUniquenessKey } = require("./roleLabelValidation");
const { RoleLabelConflictError, etagFor } = require("./roleLabelRepository");

function mapRow(row) {
  if (!row) return null;
  return { organizationId: row.logto_organization_id, canonicalRoleId: row.canonical_role_id, alias: row.alias, aliasUniquenessKey: row.alias_uniqueness_key, version: Number(row.version), etag: etagFor(row.version), updatedAt: new Date(row.updated_at).toISOString() };
}
function expectedVersion(etag) { const match = /^"role-alias-v(\d+)"$/.exec(String(etag || "")); return match ? Number(match[1]) : -1; }

function createPostgresRoleLabelRepository({ pool, clock = () => new Date() } = {}) {
  if (!pool?.connect) throw new TypeError("A PostgreSQL pool is required");
  async function transaction(work) { const client = await pool.connect(); try { await client.query("BEGIN"); const value = await work(client); await client.query("COMMIT"); return value; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }
  return {
    kind: "postgres",
    async get({ organizationId, canonicalRoleId }) {
      const { rows } = await pool.query("SELECT * FROM organization_role_aliases WHERE logto_organization_id = $1 AND canonical_role_id = $2 AND alias IS NOT NULL", [organizationId, canonicalRoleId]);
      return mapRow(rows[0]);
    },
    async getState({ organizationId, canonicalRoleId }) {
      const { rows } = await pool.query("SELECT * FROM organization_role_aliases WHERE logto_organization_id = $1 AND canonical_role_id = $2", [organizationId, canonicalRoleId]);
      return mapRow(rows[0]);
    },
    async list({ organizationId }) {
      const { rows } = await pool.query("SELECT * FROM organization_role_aliases WHERE logto_organization_id = $1 AND alias IS NOT NULL ORDER BY canonical_role_id", [organizationId]);
      return rows.map(mapRow);
    },
    async update(input) { return write({ ...input, alias: input.alias, action: "role_alias.updated" }); },
    async reset(input) { return write({ ...input, alias: null, action: "role_alias.reset" }); },
  };

  async function write({ organizationId, canonicalRoleId, alias, expectedEtag, actorLogtoUserId, action }) {
    const expected = expectedVersion(expectedEtag);
    if (expected < 0) throw new RoleLabelConflictError("role_alias_etag_conflict", "A valid If-Match role alias ETag is required.");
    return transaction(async (client) => {
      const currentResult = await client.query("SELECT * FROM organization_role_aliases WHERE logto_organization_id = $1 AND canonical_role_id = $2 FOR UPDATE", [organizationId, canonicalRoleId]);
      const current = mapRow(currentResult.rows[0]);
      if ((current?.version || 0) !== expected || (alias == null && current?.alias == null)) throw new RoleLabelConflictError("role_alias_etag_conflict", "Role alias has changed; reload it before retrying.");
      const version = expected + 1;
      const updatedAt = clock();
      let result;
      try {
        const query = await client.query(`INSERT INTO organization_role_aliases (logto_organization_id, canonical_role_id, alias, alias_uniqueness_key, version, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (logto_organization_id, canonical_role_id) DO UPDATE SET alias=EXCLUDED.alias, alias_uniqueness_key=EXCLUDED.alias_uniqueness_key, version=EXCLUDED.version, updated_at=EXCLUDED.updated_at
          WHERE organization_role_aliases.version = $7 RETURNING *`, [organizationId, canonicalRoleId, alias, alias == null ? null : aliasUniquenessKey(alias), version, updatedAt, expected]);
        if (!query.rows[0]) throw new RoleLabelConflictError("role_alias_etag_conflict", "Role alias has changed; reload it before retrying.");
        result = mapRow(query.rows[0]);
      } catch (error) {
        if (error.code === "23505" && error.constraint === "organization_role_aliases_tenant_alias_uidx") { const conflict = new RoleLabelConflictError("role_alias_not_unique", "Role alias must be unique within the organization."); conflict.status = 409; throw conflict; }
        throw error;
      }
      const before = current ? { alias: "[REDACTED]", version: current.version } : null;
      const after = { alias: alias == null ? null : "[REDACTED]", version };
      await client.query("INSERT INTO audit_logs (logto_organization_id, actor_logto_user_id, actor_type, action, target_type, target_id, metadata) VALUES ($1,$2,'user',$3,'canonical_role',$4,$5::jsonb)", [organizationId, actorLogtoUserId || null, action, canonicalRoleId, JSON.stringify({ before, after, version })]);
      await client.query("INSERT INTO authorization_outbox_events (event_type, aggregate_type, aggregate_id, event_version, logto_organization_id, subject_logto_user_id, payload) VALUES ($1,'role_alias',$2,$3,$4,$5,$6::jsonb)", [action, canonicalRoleId, String(version), organizationId, actorLogtoUserId || null, JSON.stringify({ organizationId, canonicalRoleId, before, after, version })]);
      return result;
    });
  }
}

module.exports = { createPostgresRoleLabelRepository };
