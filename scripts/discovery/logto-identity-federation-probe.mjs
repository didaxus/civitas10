#!/usr/bin/env node
import crypto from 'node:crypto';
import net from 'node:net';

export const PROBE_VERSION = '2026-07-issue-154-phase-0-v2';
export const DEFAULT_MAX_RESPONSE_BYTES = 128 * 1024;
export const DEFAULT_TIMEOUT_MS = 5000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const SENSITIVE_KEY_PATTERN = /(authorization|password|secret|token|credential|cookie|client[_-]?secret|api[_-]?key|email|phone|name|subject|groups?)/i;
const DISCOVERY_ORGANIZATION_ID_PLACEHOLDER = '{organizationId}';

export class ProbePolicyError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ProbePolicyError';
    this.details = details;
  }
}

export function sha256(value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

export function detectCredentialState(env = process.env) {
  return Object.freeze({
    credentialsPresent: Boolean((env.LOGTO_M2M_CLIENT_ID || env.LOGTO_M2M_APP_ID) && (env.LOGTO_M2M_CLIENT_SECRET || env.LOGTO_M2M_APP_SECRET)),
    credentialSource: (env.LOGTO_M2M_CLIENT_ID || env.LOGTO_M2M_APP_ID || env.LOGTO_M2M_CLIENT_SECRET || env.LOGTO_M2M_APP_SECRET) ? 'environment' : 'absent',
    managementAudiencePresent: Boolean(env.LOGTO_MANAGEMENT_API_RESOURCE),
    endpointConfigured: Boolean(env.LOGTO_ENDPOINT || env.LOGTO_ISSUER || env.VITE_LOGTO_ENDPOINT),
    remoteReadExplicitlyEnabled: env.LOGTO_IDENTITY_DISCOVERY_ALLOW_REMOTE_READ === 'true',
  });
}

export function assertPublicHost(host) {
  const candidate = String(host || '').split(':')[0];
  const ipVersion = net.isIP(candidate);
  if (!ipVersion) return true;
  if (candidate === '127.0.0.1' || candidate === '0.0.0.0' || candidate.startsWith('10.') || candidate.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(candidate) || candidate.startsWith('169.254.') || candidate === '::1' || candidate.startsWith('fc') || candidate.startsWith('fd') || candidate.startsWith('fe80:')) throw new ProbePolicyError('private or loopback host blocked before network', { hostHash: sha256(candidate) });
  return true;
}

export function buildPolicy({ endpoint, tokenPath = '/oidc/token', allowedPaths = [], allowedHosts = [], allowedQueryKeys = [], maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES } = {}) {
  const endpointUrl = endpoint ? new URL(endpoint) : null;
  const endpointHost = endpointUrl?.host || null;
  for (const host of [endpointHost, ...allowedHosts].filter(Boolean)) assertPublicHost(host);
  const hosts = new Set([endpointHost, ...allowedHosts].filter(Boolean));
  const normalizedPaths = new Set(allowedPaths.map((path) => normalizePath(path)));
  normalizedPaths.add(normalizePath(tokenPath));
  return Object.freeze({ endpoint: endpointUrl?.origin || null, endpointHost, tokenPath: normalizePath(tokenPath), allowedHosts: [...hosts], allowedPaths: [...normalizedPaths], allowedQueryKeys: [...allowedQueryKeys].sort(), maxResponseBytes });
}

export function normalizePath(path) {
  if (!path || typeof path !== 'string') return '/';
  return path.startsWith('/') ? path.split('?')[0] || '/' : `/${path.split('?')[0]}`;
}

export function assertRequestAllowed({ method, url, policy, isTokenRequest = false }) {
  const upper = String(method || 'GET').toUpperCase();
  const parsed = new URL(url, policy.endpoint || 'https://logto.invalid');
  const path = normalizePath(parsed.pathname);
  if (!policy.allowedHosts.includes(parsed.host)) throw new ProbePolicyError('unknown host blocked before network', { hostHash: sha256(parsed.host), method: upper, path });
  assertPublicHost(parsed.hostname);
  if (!policy.allowedPaths.includes(path)) throw new ProbePolicyError('unknown path blocked before network', { method: upper, path });
  for (const key of parsed.searchParams.keys()) if (!policy.allowedQueryKeys.includes(key)) throw new ProbePolicyError('unknown query parameter blocked before network', { method: upper, path, key });
  if (isTokenRequest) {
    if (upper !== 'POST' || path !== policy.tokenPath) throw new ProbePolicyError('only exact token endpoint may use POST', { method: upper, path });
    return true;
  }
  if (!SAFE_METHODS.has(upper)) throw new ProbePolicyError('unsafe management method blocked before network', { method: upper, path });
  return true;
}

export async function guardedFetch(url, { method = 'GET', policy, isTokenRequest = false, transport = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, headers, body } = {}) {
  assertRequestAllowed({ method, url, policy, isTokenRequest });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(url, { method, redirect: 'manual', signal: controller.signal, headers, body });
    const location = response.headers?.get?.('location');
    if (location) {
      const redirect = new URL(location, url);
      if (!policy.allowedHosts.includes(redirect.host)) throw new ProbePolicyError('redirect to unknown host blocked', { hostHash: sha256(redirect.host) });
    }
    const text = await readBoundedResponseText(response, policy.maxResponseBytes);
    return { status: response.status, ok: response.ok, headers: redactHeaders(response.headers), bodyShape: summarizeShape(safeParseJson(text)) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function readBoundedResponseText(response, maxResponseBytes) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.byteLength;
      if (total > maxResponseBytes) { await reader.cancel?.(); throw new ProbePolicyError('response above size limit blocked during streaming', { maxResponseBytes }); }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await response.text?.() ?? '';
  if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) throw new ProbePolicyError('response above size limit blocked', { maxResponseBytes });
  return text;
}

export function safeParseJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { nonJson: true, length: text.length }; }
}

export function summarizeShape(value, depth = 0) {
  if (value == null) return { type: value === null ? 'null' : 'undefined' };
  if (depth > 4) return { type: 'max_depth' };
  if (Array.isArray(value)) return { type: 'array', length: value.length, itemShape: value.length ? summarizeShape(value[0], depth + 1) : null };
  if (typeof value === 'object') {
    return { type: 'object', keys: Object.keys(value).sort(), fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY_PATTERN.test(key) ? { type: 'redacted', hash: sha256(JSON.stringify(entry)) } : summarizeShape(entry, depth + 1)])) };
  }
  return { type: typeof value };
}

export function redactHeaders(headers) {
  if (!headers?.entries) return {};
  return Object.fromEntries([...headers.entries()].map(([key, value]) => [key, SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : String(value).slice(0, 120)]));
}

export const BASE_DISCOVERY_ENDPOINTS = Object.freeze([
  '/api/.well-known/sign-in-exp',
  '/api/organizations',
  '/api/organization-roles',
  '/api/sso-connectors',
  '/api/connectors',
  '/api/users',
  '/api/hooks',
  '/api/resources',
]);

<<<<<<< ours
export function organizationJitSsoConnectorsPath(organizationId = DISCOVERY_ORGANIZATION_ID_PLACEHOLDER) {
  if (!organizationId || /[/?#]/.test(String(organizationId))) throw new ProbePolicyError('invalid organization id for discovery path');
  return `/api/organizations/${encodeURIComponent(String(organizationId))}/jit-sso-connectors`;
}

export function discoveryEndpoints({ organizationId = DISCOVERY_ORGANIZATION_ID_PLACEHOLDER } = {}) {
  return Object.freeze([...BASE_DISCOVERY_ENDPOINTS, organizationJitSsoConnectorsPath(organizationId)]);
}

export const DISCOVERY_ENDPOINTS = discoveryEndpoints();

export function detectExternalGroupShape(value) {
  const groups = value?.user?.sso_identities?.[0]?.profile?.groups;
  const hasProfileGroups = Array.isArray(groups);
  const externalGroupsPresent = hasProfileGroups && groups.length > 0;
  const overageMarkers = [
    value?.user?.sso_identities?.[0]?.profile?.hasgroups,
    value?.user?.sso_identities?.[0]?.profile?._claim_names?.groups,
    value?.user?.sso_identities?.[0]?.profile?.groupsOverage,
  ];
  const groupCompletenessCanBeDetermined = hasProfileGroups && !overageMarkers.some(Boolean);
  return { customTokenScriptClaimShape: { userSsoIdentitiesProfileGroupsAvailable: hasProfileGroups }, externalGroupsPresent, groupCompletenessCanBeDetermined };
}

function collectHashes(value, keys = ['id', 'userId', 'organizationId', 'connectorId', 'enterpriseSsoIdentityId'], out = []) {
  if (value == null || out.length >= 12) return out;
  if (Array.isArray(value)) for (const entry of value) collectHashes(entry, keys, out);
  else if (typeof value === 'object') for (const [key, entry] of Object.entries(value)) keys.includes(key) && typeof entry !== 'object' ? out.push({ sourceKey: key, hash: sha256(entry) }) : collectHashes(entry, keys, out);
  return out;
}

export function buildEvidenceArtifact({ endpoint, observations = [], customTokenScriptClaimSample = null } = {}) {
  const claimShape = detectExternalGroupShape(customTokenScriptClaimSample);
  return {
    probeVersion: PROBE_VERSION,
    logtoEndpointHash: sha256(new URL(endpoint).origin),
    endpoints: observations.map(({ method = 'GET', path, status, body }) => ({
      method: String(method).toUpperCase(),
      path: normalizePath(path),
      httpStatus: status,
      redactedResponseShape: summarizeShape(body),
    })),
    customTokenScriptClaimShape: claimShape.customTokenScriptClaimShape,
    externalGroupsPresent: claimShape.externalGroupsPresent,
    groupCompletenessCanBeDetermined: claimShape.groupCompletenessCanBeDetermined,
    stableCorrelationCandidates: observations.flatMap(({ body }) => collectHashes(body)).slice(0, 12),
  };
}

export async function runStaticDiscovery({ env = process.env } = {}) {
  const credentialState = detectCredentialState(env);
  const organizationId = env.LOGTO_DISCOVERY_ORGANIZATION_ID || DISCOVERY_ORGANIZATION_ID_PLACEHOLDER;
  const endpoints = discoveryEndpoints({ organizationId });
  return { probeVersion: PROBE_VERSION, remoteState: 'verification_required', remoteObservationPerformed: false, credentialState, plannedReadOnlyEndpoints: endpoints.map((path) => ({ method: 'GET', path })), evidenceSections: [{ name: 'custom-token-script-claim-shape', verifies: 'user.sso_identities[0].profile.groups availability' }] };
=======

export function resolveEndpoint(env = process.env) {
  return (env.LOGTO_ENDPOINT || env.LOGTO_ISSUER || env.VITE_LOGTO_ENDPOINT || '').replace(/\/+$/, '');
}

export async function requestM2MToken({ env = process.env, policy, transport = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const endpoint = resolveEndpoint(env);
  const clientId = env.LOGTO_M2M_CLIENT_ID || env.LOGTO_M2M_APP_ID;
  const clientSecret = env.LOGTO_M2M_CLIENT_SECRET || env.LOGTO_M2M_APP_SECRET;
  const resource = env.LOGTO_MANAGEMENT_API_RESOURCE;
  const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, resource });
  const tokenUrl = `${endpoint}${policy.tokenPath}`;
  assertRequestAllowed({ method: 'POST', url: tokenUrl, policy, isTokenRequest: true });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await transport(tokenUrl, { method: 'POST', redirect: 'manual', signal: controller.signal, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
    const text = await readBoundedResponseText(response, policy.maxResponseBytes);
    const parsed = safeParseJson(text);
    return { accessToken: parsed?.access_token || null, observation: { status: response.status, ok: response.ok, headers: redactHeaders(response.headers), bodyShape: summarizeShape(parsed) } };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runStaticDiscovery({ env = process.env, transport = fetch } = {}) {
  const credentialState = detectCredentialState(env);
  const endpoint = resolveEndpoint(env);
  const plannedReadOnlyEndpoints = DISCOVERY_ENDPOINTS.map((path) => ({ method: 'GET', path }));
  if (!credentialState.remoteReadExplicitlyEnabled || !credentialState.credentialsPresent || !credentialState.managementAudiencePresent || !credentialState.endpointConfigured) {
    return { probeVersion: PROBE_VERSION, remoteState: 'verification_required', remoteObservationPerformed: false, credentialState, plannedReadOnlyEndpoints };
  }
  const policy = buildPolicy({ endpoint, allowedPaths: DISCOVERY_ENDPOINTS, allowedQueryKeys: ['page', 'page_size', 'limit', 'offset'] });
  const { accessToken, observation: tokenObservation } = await requestM2MToken({ env, policy, transport });
  const endpointEvidence = [];
  if (!accessToken) return { probeVersion: PROBE_VERSION, remoteState: 'token_unavailable', remoteObservationPerformed: false, credentialState, tokenObservation, plannedReadOnlyEndpoints };
  for (const item of plannedReadOnlyEndpoints) {
    const url = `${endpoint}${item.path}`;
    endpointEvidence.push({ ...item, ...(await guardedFetch(url, { method: item.method, policy, transport, headers: { authorization: `Bearer ${accessToken}` } })) });
  }
  return { probeVersion: PROBE_VERSION, remoteState: 'observed', remoteObservationPerformed: true, credentialState, tokenObservation, endpointEvidence };
>>>>>>> theirs
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runStaticDiscovery();
  console.log(JSON.stringify(result, null, 2));
}
