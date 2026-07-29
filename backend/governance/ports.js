"use strict";

function requireGovernancePorts(ports = {}) {
  const required = ["entitlements", "taxonomy", "organizationUnits", "dataScope", "aliasesNavigation", "audit", "outbox", "transaction"];
  for (const name of required) if (!ports[name]) throw new Error(`governance_port_required:${name}`);
  return Object.freeze({ ...ports });
}

module.exports = { requireGovernancePorts };
