'use strict';

function createPostgresMcpOperationalAdapter({ pool }) {
  if (!pool?.query) throw new TypeError('pg Pool is required');
  return Object.freeze({
    get: async ({ toolId, version }) => (await pool.query('select * from mcp_tool_registry where tool_id=$1 and tool_version=$2', [toolId, version])).rows[0] || null,
    save: async (tool) => { await pool.query('update mcp_tool_registry set status=$3, updated_at=$4 where tool_id=$1 and tool_version=$2', [tool.toolId, tool.version, tool.status, tool.updatedAt]); },
    isDisabled: async ({ tenantId, toolId, version }) => Boolean((await pool.query("select 1 from mcp_kill_switches where enabled=true and (scope='global' or (scope='tenant' and tenant_id=$1) or (scope='tool' and tool_id=$2 and (tool_version is null or tool_version=$3))) limit 1", [tenantId, toolId, version])).rowCount),
    consume: async ({ tenantId, toolId, principalId, units, correlationId }) => { const result = await pool.query('select allowed, remaining from mcp_consume_usage($1,$2,$3,$4,$5)', [tenantId, toolId, principalId, units, correlationId]); return result.rows[0]; },
    record: async (event) => { await pool.query('insert into mcp_audit_events(event_type,tenant_id,tool_id,tool_version,principal_id,decision_id,correlation_id,delegation_id,outcome,detail_json) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [event.eventType, event.tenantId || null, event.toolId, event.toolVersion, event.principalId || event.actor || null, event.decisionId || null, event.correlationId, event.delegationId || null, event.outcome || null, event]); },
  });
}

module.exports = { createPostgresMcpOperationalAdapter };
