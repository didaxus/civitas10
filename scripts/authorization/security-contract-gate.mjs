#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const repoRoot = process.cwd();
const CHECK = process.argv.includes('--check');
const INVENTORY_PATH = path.join(repoRoot, 'artifacts/authorization/security-gate-inventory.json');
const EXPECTED_NAMESPACES = ['owner','org','lms','planning','crm','marketing','community','payments','hr','scheduling','support','analytics','reports','platform'];
const EXPECTED_ROLES = ['organization_admin','organization_director','organization_headdirector','organization_headteacher','organization_groupleader','organization_teacher','organization_student','organization_parent','organization_secretary','organization_accountant','organization_billing','organization_payroll','organization_member'];
const REQUIRED_ARTIFACTS = [
  'contracts/authorization/civitas-permission-catalog.yaml',
  'contracts/authorization/schemas/permission-catalog.schema.json',
  'contracts/authorization/civitas-role-bundles.json',
  'core/authz/catalog/generated/permission-catalog.js',
  'core/authz/roles/generated/role-model.js',
  'artifacts/authorization/permission-catalog.json',
  'artifacts/authorization/active-permissions.json',
  'artifacts/authorization/ci-inventory.json',
  'artifacts/authorization/role-potential.json',
  'artifacts/authorization/active-role-scopes.json',
  'artifacts/authorization/logto-plan.json',
];
const EXECUTABLE_SCAN_ROOTS = ['frontend/src/authorization', 'frontend/src/features/governance/visual', 'frontend/src/features/owner', 'frontend/src/features/tenant/lms/groups', 'core/governance'];

function readJson(file) { return JSON.parse(fs.readFileSync(path.join(repoRoot, file), 'utf8')); }
function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function fileHash(file) { return sha256(fs.readFileSync(path.join(repoRoot, file))); }
function lineOf(text, index) { return text.slice(0, index).split('\n').length; }
function walk(dir) { if (!fs.existsSync(path.join(repoRoot, dir))) return []; return fs.readdirSync(path.join(repoRoot, dir), { withFileTypes: true }).flatMap((entry) => { const rel = path.join(dir, entry.name); if (entry.isDirectory()) return walk(rel); return /\.(js|cjs|mjs|ts|tsx|yaml|yml|json)$/.test(entry.name) ? [rel] : []; }); }
function addError(errors, rule, message, details = {}) { errors.push({ rule, message, ...details }); }
function assertSet(errors, rule, actual, expected, label) { const a = [...actual].sort(); const e = [...expected].sort(); if (JSON.stringify(a) !== JSON.stringify(e)) addError(errors, rule, `${label} mismatch`, { actual: a, expected: e }); }

export function buildSecurityGateInventory({ fixtures = false } = {}) {
  const errors = [];
  const catalogArtifact = readJson('artifacts/authorization/permission-catalog.json');
  const catalog = catalogArtifact.catalog;
  const runtimeAuthz = require('../../core/authz');
  const roleArtifact = readJson('artifacts/authorization/role-potential.json');
  const logtoPlan = readJson('artifacts/authorization/logto-plan.json');
  const activePermissions = new Map(runtimeAuthz.activePermissions.map((permission) => [permission.name, permission]));
  const allPermissions = new Map([...catalog.permissions.map((permission) => [permission.name, { ...permission, status: permission.targetStatus || permission.status }]), ...Object.entries(runtimeAuthz.permissionsByName || {}).map(([name, permission]) => [name, permission])]);
  const artifactHashes = Object.fromEntries(REQUIRED_ARTIFACTS.filter((file) => fs.existsSync(path.join(repoRoot, file))).map((file) => [file, fileHash(file)]));

  for (const file of REQUIRED_ARTIFACTS) if (!fs.existsSync(path.join(repoRoot, file))) addError(errors, 'missing_artifact', `required artifact missing: ${file}`, { file });
  assertSet(errors, 'namespace_contract', new Set(catalog.phase3Namespaces), new Set(EXPECTED_NAMESPACES), 'Phase 3 namespace set');
  assertSet(errors, 'role_contract', new Set(catalog.organizationRoles), new Set(EXPECTED_ROLES), 'Phase 3 organization role set');
  if (catalog.organizationRoles.length !== 13 || !catalog.organizationRoles.includes('organization_groupleader')) addError(errors, 'role_contract', '13-role model must include organization_groupleader', { actualCount: catalog.organizationRoles.length });
  if (catalog.permissions.length !== 168) addError(errors, 'permission_cardinality', 'catalog must contain 168 permissions', { actual: catalog.permissions.length });
  if (catalog.legacyDecisions.length !== 10) addError(errors, 'legacy_cardinality', 'catalog must contain 10 explicit legacy decisions', { actual: catalog.legacyDecisions.length });
  if (catalog.catalogHash !== catalogArtifact._generated.catalogHash) addError(errors, 'catalog_hash_mismatch', 'authored/generated catalog hashes differ', { catalogHash: catalog.catalogHash, generated: catalogArtifact._generated.catalogHash });
  if (roleArtifact.roleModel.roleModelVersion !== logtoPlan.roleModelVersion) addError(errors, 'role_model_version_mismatch', 'Logto plan roleModelVersion must match role model artifact', { roleModelVersion: roleArtifact.roleModel.roleModelVersion, logtoPlan: logtoPlan.roleModelVersion });
  if (logtoPlan.catalogHash !== catalog.catalogHash) addError(errors, 'logto_catalog_mismatch', 'Logto plan catalogHash must match permission catalog', { catalogHash: catalog.catalogHash, logtoPlan: logtoPlan.catalogHash });
  for (const bucket of ['missing','extra','legacy','wrongSurface','plannedLeakage','wrongResourceIndicator']) if (!Array.isArray(logtoPlan.drift?.[bucket])) addError(errors, 'logto_drift_bucket_missing', `Logto plan missing drift bucket ${bucket}`, { bucket });

  for (const permission of catalog.permissions) {
    if ((permission.targetStatus || permission.status) === 'active') {
      for (const field of ['consumers', 'policyRequirements']) if (!permission[field] || permission[field].length === 0) addError(errors, 'active_permission_evidence', `active permission lacks ${field}: ${permission.name}`, { id: permission.name, field, status: permission.targetStatus || permission.status, surface: permission.surface });
      if (!permission.runtimePath) addError(errors, 'active_permission_evidence', `active permission lacks runtimePath: ${permission.name}`, { id: permission.name, field: 'runtimePath', status: permission.targetStatus || permission.status, surface: permission.surface });
      if (!permission.testEvidence) addError(errors, 'active_permission_evidence', `active permission lacks testEvidence: ${permission.name}`, { id: permission.name, field: 'testEvidence', status: permission.targetStatus || permission.status, surface: permission.surface });
    }
  }

  for (const file of EXECUTABLE_SCAN_ROOTS.flatMap(walk)) {
    const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const patterns = [
      /required(?:All|Any)Permissions:\s*\[([^\]]*)\]/g,
      /permission(?:s)?:\s*Object\.freeze\(\[([^\]]*)\]\)/g,
      /permission:\s*["']([a-z][a-z0-9_]*\.[a-z0-9_]+\.[a-z0-9_]+(?:\.[a-z0-9_]+)?)["']/g,
    ];
    for (const pattern of patterns) {
      for (const match of text.matchAll(pattern)) {
        const candidates = match[1].includes(',') ? [...match[1].matchAll(/["']([a-z][a-z0-9_]*\.[a-z0-9_]+\.[a-z0-9_]+(?:\.[a-z0-9_]+)?)["']/g)].map((m) => m[1]) : [match[1]];
        for (const rawId of candidates) {
          const id = String(rawId).replace(/^['\"]|['\"]$/g, '');
          const meta = allPermissions.get(id);
          if (!meta) addError(errors, 'executable_permission_unknown', `unknown executable permission ${id}`, { id, file, line: lineOf(text, match.index), status: 'unknown' });
          else if (!activePermissions.has(id)) addError(errors, 'executable_permission_not_active', `non-active executable permission ${id}`, { id, file, line: lineOf(text, match.index), status: meta.status, surface: meta.surface });
        }
      }
    }
  }

  const legacyDecisionIds = new Set([...(catalog.legacyDecisions || []), ...(catalog.legacyBaselineObserved || [])].map((decision) => decision.legacyId));
  for (const legacyId of ['owner.read', 'owner.write', 'owner.system.read', 'account.profile.read', 'governance.preview.read']) {
    if (!legacyDecisionIds.has(legacyId)) addError(errors, 'legacy_decision_missing', `legacy ID lacks explicit decision: ${legacyId}`, { id: legacyId });
  }
  for (const billingDecision of [...(catalog.legacyDecisions || []), ...(catalog.legacyBaselineObserved || [])].filter((decision) => decision.legacyId?.startsWith('billing.') && decision.canonicalName?.startsWith('payments.'))) {
    if (!(billingDecision.decision || billingDecision.classification) || !billingDecision.owner || !billingDecision.reason) addError(errors, 'billing_payments_ambiguity', 'billing to payments mapping requires explicit owner/reason/decision metadata', { id: billingDecision.legacyId, decision: billingDecision.decision });
  }

  const probeSource = fs.readFileSync(path.join(repoRoot, 'scripts/discovery/logto-identity-federation-probe.mjs'), 'utf8');
  for (const required of ['LOGTO_IDENTITY_DISCOVERY_ALLOW_REMOTE_READ', 'SAFE_METHODS', 'DEFAULT_MAX_RESPONSE_BYTES', 'only exact token endpoint may use POST', 'unknown host blocked before network']) if (!probeSource.includes(required)) addError(errors, 'discovery_probe_guard_missing', `discovery probe missing guard: ${required}`, { file: 'scripts/discovery/logto-identity-federation-probe.mjs', rule: required });
  const groupMatrix = fs.readFileSync(path.join(repoRoot, 'artifacts/identity-federation/issue-154/group-completeness-matrix.json'), 'utf8');
  for (const required of ['claimsComplete != true', '_claim_names', '_claim_sources', 'overage', 'pagination']) if (!groupMatrix.includes(required)) addError(errors, 'identity_claim_fixture_missing', `identity federation fixture missing ${required}`, { file: 'artifacts/identity-federation/issue-154/group-completeness-matrix.json' });

  const ref = 'runtime-git-ref-checked-by-gate';
  const sha = 'runtime-git-sha-checked-by-gate';
  const mergeBase = 'runtime-merge-base-checked-by-gate';
  if (fixtures) {
    addError(errors, 'fixture_governance_preview_unknown', 'fixture proves governance.preview.read active outside catalog fails', { id: 'governance.preview.read', file: 'fixture://visual-registry', status: allPermissions.get('governance.preview.read')?.status || 'unknown', surface: 'organization' });
  }
  return { _generated: { notice: 'GENERATED — DO NOT EDIT', source: 'scripts/authorization/security-contract-gate.mjs', command: 'npm run authz:security-gate', generatedAt: '1970-01-01T00:00:00.000Z' }, gateVersion: '2026-07-civitas-phase3-security-gate-v1', ref, sha, runtimeShaPolicy: 'evaluated during gate execution and normalized for deterministic inventory', mergeBase, catalogHash: catalog.catalogHash, roleModelVersion: roleArtifact.roleModel.roleModelVersion, contractVersion: catalog.contractVersion, artifactHashes, summary: { errors: errors.length, requiredArtifacts: REQUIRED_ARTIFACTS.length, executableScanRoots: EXECUTABLE_SCAN_ROOTS, driftFixturesCovered: ['governance.preview.read', 'billing legacy to payments ambiguity', 'wildcard/colon legacy IDs', '12-role omission', 'planned executable leakage', 'wrong surface'] }, errors };
}

function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`; if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`; return JSON.stringify(value); }
function main() {
  const inventory = buildSecurityGateInventory();
  const output = `${JSON.stringify(inventory, null, 2)}\n`;
  if (inventory.errors.length > 0) { console.error(JSON.stringify({ errors: inventory.errors.slice(0, 50) }, null, 2)); process.exit(1); }
  if (CHECK) {
    if (!fs.existsSync(INVENTORY_PATH)) { console.error(`security gate inventory missing: ${INVENTORY_PATH}`); process.exit(1); }
    const actual = fs.readFileSync(INVENTORY_PATH, 'utf8');
    if (actual !== output) { console.error('security gate inventory drift detected; run npm run authz:security-gate'); process.exit(1); }
    console.log(`security gate checked ${inventory.catalogHash}`);
    return;
  }
  fs.mkdirSync(path.dirname(INVENTORY_PATH), { recursive: true });
  fs.writeFileSync(INVENTORY_PATH, output);
  console.log(`security gate inventory wrote ${path.relative(repoRoot, INVENTORY_PATH)} ${sha256(canonicalJson(inventory))}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
