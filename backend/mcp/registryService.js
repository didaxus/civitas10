'use strict';

const LIFECYCLE = Object.freeze(['draft', 'review', 'approved', 'planned', 'active', 'deprecated', 'removed']);
const transitions = new Map(LIFECYCLE.slice(0, -1).map((state, index) => [state, LIFECYCLE[index + 1]]));

function createMcpRegistryService({ registryPort, auditPort, clock = () => new Date() }) {
  if (!registryPort?.get || !registryPort?.save || !auditPort?.record) throw new TypeError('registry and audit ports are required');
  async function transition({ toolId, version, to, actor, correlationId, evidence }) {
    const current = await registryPort.get({ toolId, version });
    if (!current) throw new Error('tool_not_found');
    if (transitions.get(current.status) !== to) throw new Error('invalid_lifecycle_transition');
    if (to === 'active' && (!current.applicationServiceId || !current.permissionId || !evidence?.reviewId || !evidence?.rollbackRef)) throw new Error('activation_evidence_required');
    const updated = Object.freeze({ ...current, status: to, updatedAt: clock().toISOString() });
    await registryPort.save(updated);
    await auditPort.record({ eventType: 'mcp.tool.lifecycle.v1', toolId, toolVersion: version, from: current.status, to, actor, correlationId, evidence: evidence || null });
    return updated;
  }
  return Object.freeze({ transition, lifecycle: LIFECYCLE });
}

module.exports = { createMcpRegistryService, LIFECYCLE };
