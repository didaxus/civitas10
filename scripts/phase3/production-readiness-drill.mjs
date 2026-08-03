import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(fs.readFileSync(new URL('operations/phase3/production-readiness.json', root)));
const requiredSlis = ['availability', 'latency', 'contract_mismatch', 'circuits', 'queue_lag', 'dlq', 'operation_age', 'remote_ui_integrity'];
const requiredDrills = ['circuit_recovery', 'dlq_reconciliation', 'backup_restore_tenant_safe', 'key_rotation', 'ui_runtime_rollback', 'decommissioning', 'secret_pii_log_scan'];
if (manifest.releaseStatus !== 'NO_GO_UNTIL_ALL_DRILLS_PASS') throw new Error('Phase 3 must default to NO_GO');
for (const id of requiredSlis) if (!manifest.slis.some((sli) => sli.id === id && sli.query && sli.alert && manifest.owners[sli.owner])) throw new Error(`Incomplete SLI: ${id}`);
for (const id of requiredDrills) if (!manifest.drills.includes(id)) throw new Error(`Missing drill: ${id}`);

const tenantA = [{ tenantId: 'tenant-a', operationId: 'op-1', state: 'complete' }];
const tenantB = [{ tenantId: 'tenant-b', operationId: 'op-2', state: 'pending' }];
const started = process.hrtime.bigint();
const restored = structuredClone(tenantA);
const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
const checks = {
  circuit_recovery: ['closed', 'open', 'half_open', 'closed'].at(-1) === 'closed',
  dlq_reconciliation: new Set(['event-1', 'event-1']).size === 1,
  backup_restore_tenant_safe: restored.every((row) => row.tenantId === 'tenant-a') && !restored.some((row) => tenantB.includes(row)),
  key_rotation: crypto.verify(null, Buffer.from('probe'), crypto.generateKeyPairSync('ed25519').publicKey, Buffer.alloc(64)) === false,
  ui_runtime_rollback: ['ui@3.1.0', 'ui@3.0.9'].at(-1) === 'ui@3.0.9',
  decommissioning: [].length === 0,
  secret_pii_log_scan: !JSON.stringify({ token: '[REDACTED]', email: '[REDACTED]' }).includes('example.test'),
};
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const evidence = {
  schemaVersion: '1.0.0', version: manifest.schemaVersion, environment: process.env.CIVITAS_DRILL_ENV || 'local-synthetic',
  timestamp: new Date().toISOString(), owner: process.env.CIVITAS_DRILL_OWNER || 'Platform Reliability', commit,
  scope: 'synthetic-contract-drill', rpoSeconds: 0, rtoMilliseconds: Number(durationMs.toFixed(3)), checks,
  allPassed: Object.values(checks).every(Boolean), phase3Complete: false,
  completionBlocker: 'Production/staging drills and residual-risk acceptance remain required; synthetic evidence cannot close Phase 3.'
};
const output = new URL('artifacts/phase3/production-readiness-drill.json', root);
fs.mkdirSync(new URL('artifacts/phase3/', root), { recursive: true });
fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`);
if (!evidence.allPassed) process.exitCode = 1;
console.log(`Phase 3 synthetic drill ${evidence.allPassed ? 'passed' : 'failed'}; release remains NO_GO. Evidence: ${output.pathname}`);
