'use strict';
const { createHash, randomUUID } = require('node:crypto');

const RANK_STEP = 1024n;
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function hash(value) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function etag(version) { return `"${version}"`; }
function parseEtag(value) { const match = /^"?(\d+)"?$/.exec(value || ''); return match ? Number(match[1]) : null; }
function stableRanks(ids) { return ids.map((id, index) => ({ id, rank: String(BigInt(index + 1) * RANK_STEP) })); }
function validateBlueprint(blueprint, components, calibration) {
  const findings = [];
  if (!blueprint) findings.push({ code: 'blueprint_missing', path: '/blueprint' });
  if (!calibration) findings.push({ code: 'calibration_missing', path: '/calibration' });
  if (!components.length) findings.push({ code: 'components_empty', path: '/components' });
  const total = components.reduce((sum, item) => sum + Number(item.weight), 0);
  if (components.length && Math.abs(total - 1) > 0.000001) findings.push({ code: 'component_weight_total', path: '/components', actual: Number(total.toFixed(6)), expected: 1 });
  return findings.sort((a, b) => canonical(a).localeCompare(canonical(b)));
}
function validationRun({ organizationId, blueprint, components, calibration, validatorVersion = '1' }) {
  const input = { blueprint, components: [...components].sort((a,b) => String(a.id).localeCompare(String(b.id))), calibration };
  const findings = validateBlueprint(blueprint, input.components, calibration);
  const inputHash = hash(input);
  return { organizationId, id: randomUUID(), blueprintId: blueprint?.id, inputHash, validatorVersion, status: findings.length ? 'invalid' : 'valid', findings };
}
module.exports = { RANK_STEP, canonical, hash, etag, parseEtag, stableRanks, validateBlueprint, validationRun };

