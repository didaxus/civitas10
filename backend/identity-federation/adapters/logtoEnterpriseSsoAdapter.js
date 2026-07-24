const dns = require('node:dns').promises;
const net = require('node:net');
const { createLocalJWKSet, jwtVerify, decodeProtectedHeader } = require('jose');

const DEFAULT_ALGORITHMS = Object.freeze(['RS256', 'ES256']);
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_MAX_RESPONSE_BYTES = 64 * 1024;
const DISCOVERY_PATH = '/.well-known/openid-configuration';

function fail(code, message) {
  const error = new Error(message || code);
  error.code = code;
  return error;
}

function isPrivateIp(address) {
  const version = net.isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    return octets[0] === 10 || octets[0] === 127 ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 169 && octets[1] === 254) ||
      octets[0] === 0 || octets[0] >= 224;
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe80:') || normalized.startsWith('::ffff:127.');
  }
  return true;
}

function assertHttpsUrl(rawUrl, field = 'url') {
  let url;
  try { url = new URL(rawUrl); } catch { throw fail('invalid_url', `${field} must be a valid URL`); }
  if (url.protocol !== 'https:') throw fail('https_required', `${field} must use https`);
  if (url.username || url.password) throw fail('url_credentials_forbidden', `${field} cannot include credentials`);
  return url;
}

async function assertPublicDns(url, resolver = dns.lookup) {
  if (net.isIP(url.hostname) && isPrivateIp(url.hostname)) throw fail('unsafe_discovery_host', 'discovery host resolves to private or loopback address');
  const results = await resolver(url.hostname, { all: true, verbatim: true });
  const addresses = Array.isArray(results) ? results : [results];
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw fail('unsafe_discovery_host', 'discovery host resolves to private or loopback address');
  }
}

async function readLimitedResponse(response, maxBytes) {
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength && Number(contentLength) > maxBytes) throw fail('response_too_large', 'OIDC response exceeds size limit');
  if (!response.body || typeof response.body.getReader !== 'function') {
    const text = await response.text();
    if (Buffer.byteLength(text) > maxBytes) throw fail('response_too_large', 'OIDC response exceeds size limit');
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw fail('response_too_large', 'OIDC response exceeds size limit');
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function safeJsonFetch(rawUrl, options = {}) {
  const { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS, maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES, dnsLookup = dns.lookup } = options;
  const url = assertHttpsUrl(rawUrl, 'OIDC endpoint');
  await assertPublicDns(url, dnsLookup);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { accept: 'application/json' } });
    if (response.status >= 300 && response.status < 400) throw fail('redirect_blocked', 'OIDC redirects are blocked');
    if (!response.ok) throw fail('fetch_failed', `OIDC fetch failed with status ${response.status}`);
    return JSON.parse(await readLimitedResponse(response, maxResponseBytes));
  } finally {
    clearTimeout(timeout);
  }
}

function discoveryUrlForIssuer(issuer) {
  const url = assertHttpsUrl(issuer, 'issuer_or_entity_id');
  const path = url.pathname.replace(/\/$/, '');
  url.pathname = `${path}${DISCOVERY_PATH}`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function validateConfig(config = {}) {
  if (!config.issuer_or_entity_id) throw fail('issuer_required', 'issuer_or_entity_id is required');
  if (!config.civitas_api_resource) throw fail('resource_required', 'civitas_api_resource is required');
  const algorithms = config.signing_algorithms || DEFAULT_ALGORITHMS;
  if (!Array.isArray(algorithms) || !algorithms.length || algorithms.includes('none')) throw fail('invalid_algorithms', 'explicit non-none signing algorithms are required');
  if ('client_secret' in config || 'private_key' in config || 'secret' in config) throw fail('plaintext_secret_forbidden', 'credentials must use secret_reference or secretsRef');
  if (config.secret_reference || config.secretsRef || config.credentials?.secret_reference || config.credentials?.secretsRef) return true;
  return true;
}

function validateAudienceAndAzp(payload, resource) {
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(resource)) throw fail('audience_mismatch', 'token audience does not include Civitas API resource');
  if (audiences.length > 1 && payload.azp !== resource) throw fail('azp_mismatch', 'authorized party must match Civitas API resource when multiple audiences are present');
  if (payload.azp && payload.azp !== resource) throw fail('azp_mismatch', 'authorized party must match Civitas API resource');
}

function createLogtoEnterpriseSsoAdapter(config = {}, deps = {}) {
  validateConfig(config);
  const algorithms = Object.freeze([...(config.signing_algorithms || DEFAULT_ALGORITHMS)]);
  const issuer = config.issuer_or_entity_id;
  const resource = config.civitas_api_resource;
  const fetchOptions = { fetchImpl: deps.fetchImpl, dnsLookup: deps.dnsLookup, timeoutMs: config.timeout_ms, maxResponseBytes: config.max_response_bytes };

  async function discover() {
    const metadata = await safeJsonFetch(discoveryUrlForIssuer(issuer), fetchOptions);
    if (metadata.issuer !== issuer) throw fail('issuer_mismatch', 'OIDC metadata issuer must exactly match issuer_or_entity_id');
    assertHttpsUrl(metadata.jwks_uri, 'jwks_uri');
    await assertPublicDns(new URL(metadata.jwks_uri), deps.dnsLookup || dns.lookup);
    return metadata;
  }

  async function fetchJwks(metadata) {
    return safeJsonFetch(metadata.jwks_uri, fetchOptions);
  }

  async function verifyOidcToken(token) {
    const header = decodeProtectedHeader(token);
    if (header.alg === 'none') throw fail('alg_none_rejected', 'unsigned OIDC tokens are rejected');
    if (!algorithms.includes(header.alg)) throw fail('alg_not_allowed', 'token signing algorithm is not configured');
    const metadata = await discover();
    const jwks = deps.jwks || await fetchJwks(metadata);
    const keyResolver = deps.keyResolver || createLocalJWKSet(jwks);
    const result = await jwtVerify(token, keyResolver, { issuer, audience: resource, algorithms });
    validateAudienceAndAzp(result.payload, resource);
    return result;
  }

  return { name: 'logto-enterprise-sso', capability: 'identity-federation', provider: 'logto', version: '1.0.0', validate: () => validateConfig(config), discover, fetchJwks, verifyOidcToken };
}


module.exports = { createLogtoEnterpriseSsoAdapter, safeJsonFetch, discoveryUrlForIssuer, validateAudienceAndAzp, isPrivateIp };
