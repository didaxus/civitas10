const crypto = require('node:crypto');
const net = require('node:net');

const SCIM_CREDENTIAL_SCOPES = Object.freeze(['scim.users.read','scim.users.write','scim.groups.read','scim.groups.write']);
const SCIM_TOKEN_PREFIX = 'civitas_scim';
const SECRET_BYTES = 32;
const SALT_BYTES = 16;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = Object.freeze({ N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function assertNonEmpty(value, name) { if (!value || typeof value !== 'string') throw new Error(`${name} is required`); return value; }
function normalizeDate(value) { if (!value) return null; const date = value instanceof Date ? value : new Date(value); if (Number.isNaN(date.getTime())) throw new Error('invalid expiration date'); return date; }
function normalizeScopes(scopes = SCIM_CREDENTIAL_SCOPES) { const unique = [...new Set(scopes)]; if (!unique.length || unique.some((s) => !SCIM_CREDENTIAL_SCOPES.includes(s))) throw new Error('invalid SCIM credential scope'); return unique.sort(); }
function randomBase64Url(bytes) { return crypto.randomBytes(bytes).toString('base64url'); }
function generateKeyId() { return `scim_${randomBase64Url(16)}`; }
function generateSecret() { return randomBase64Url(SECRET_BYTES); }
function formatBearerToken(keyId, secret) { return `${SCIM_TOKEN_PREFIX}_${keyId}.${secret}`; }
function parseBearerToken(token) { const raw = String(token || '').replace(/^Bearer\s+/i, ''); const marker = `${SCIM_TOKEN_PREFIX}_`; if (!raw.startsWith(marker)) return null; const dot = raw.indexOf('.'); if (dot <= marker.length) return null; return { keyId: raw.slice(marker.length, dot), secret: raw.slice(dot + 1) }; }
function hashSecret(secret, salt = randomBase64Url(SALT_BYTES)) { const hash = crypto.scryptSync(String(secret), salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS).toString('base64url'); return `scrypt:${SCRYPT_OPTIONS.N}:${SCRYPT_OPTIONS.r}:${SCRYPT_OPTIONS.p}:${salt}:${hash}`; }
function verifySecretHash(secret, encodedHash) { const parts = String(encodedHash || '').split(':'); if (parts.length !== 6 || parts[0] !== 'scrypt') return false; const [, n, r, p, salt, expected] = parts; const actual = crypto.scryptSync(String(secret), salt, Buffer.from(expected, 'base64url').length, { N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024 }); const expectedBuffer = Buffer.from(expected, 'base64url'); return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer); }
function scopeAllows(credentialScopes, requiredScopes = []) { const have = new Set(credentialScopes || []); return requiredScopes.every((scope) => have.has(scope)); }
function ipToBigInt(ip) { if (net.isIP(ip) === 4) return BigInt(ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0)); return null; }
function cidrAllows(ip, cidrs = []) { if (!cidrs || cidrs.length === 0) return true; const target = ipToBigInt(ip); if (target == null) return false; return cidrs.some((cidr) => { const [base, bitsRaw] = String(cidr).split('/'); const bits = bitsRaw == null ? 32 : Number(bitsRaw); const baseInt = ipToBigInt(base); if (baseInt == null || bits < 0 || bits > 32) return false; const mask = bits === 0 ? 0n : ((0xffffffffn << BigInt(32 - bits)) & 0xffffffffn); return (target & mask) === (baseInt & mask); }); }
function sanitizeCredential(row) { if (!row) return null; const { secret_hash, secretHash, ...safe } = row; return safe; }

class InMemoryScimCredentialRepository {
  constructor() { this.rows = new Map(); }
  async insert(row) { this.rows.set(row.keyId, { ...row }); return { ...row }; }
  async findByKeyId(keyId) { const row = this.rows.get(keyId); return row ? { ...row } : null; }
  async listActiveForConnection({ logtoOrganizationId, connectionId, now = new Date() }) { return [...this.rows.values()].filter((r) => r.logtoOrganizationId === logtoOrganizationId && r.connectionId === connectionId && r.status === 'active' && (!r.expiresAt || new Date(r.expiresAt) > now)); }
  async updateExpiration({ logtoOrganizationId, keyId, expiresAt, updatedAt = new Date() }) { const row = this.rows.get(keyId); if (!row || row.logtoOrganizationId !== logtoOrganizationId) return null; const next = { ...row, expiresAt, updatedAt }; this.rows.set(keyId, next); return { ...next }; }
  async revoke({ logtoOrganizationId, keyId, revokedAt = new Date(), reason = 'revoked' }) { const row = this.rows.get(keyId); if (!row || row.logtoOrganizationId !== logtoOrganizationId) return null; const next = { ...row, status: 'revoked', revokedAt, revokedReason: reason, updatedAt: revokedAt }; this.rows.set(keyId, next); return { ...next }; }
  async updateLastUsed({ keyId, lastUsedAt = new Date(), ip = null }) { const row = this.rows.get(keyId); if (!row) return null; const next = { ...row, lastUsedAt, lastUsedIp: ip, updatedAt: lastUsedAt }; this.rows.set(keyId, next); return { ...next }; }
}

function createScimCredentialService({ repository = new InMemoryScimCredentialRepository(), clock = () => new Date() } = {}) {
  async function issueCredential({ logtoOrganizationId, connectionId, scopes, expiresAt = null, cidrAllowlist = [], actorLogtoUserId = null, rotationOfKeyId = null } = {}) {
    assertNonEmpty(logtoOrganizationId, 'logtoOrganizationId'); assertNonEmpty(connectionId, 'connectionId');
    const keyId = generateKeyId(); const secret = generateSecret(); const now = clock();
    const row = await repository.insert({ keyId, logtoOrganizationId, connectionId, secretHash: hashSecret(secret), scopes: normalizeScopes(scopes), status: 'active', expiresAt: normalizeDate(expiresAt), cidrAllowlist, rotationOfKeyId, createdByLogtoUserId: actorLogtoUserId, createdAt: now, updatedAt: now, lastUsedAt: null, lastUsedIp: null, revokedAt: null, revokedReason: null });
    return { credential: sanitizeCredential(row), bearerToken: formatBearerToken(keyId, secret) };
  }
  async function rotateCredential({ logtoOrganizationId, connectionId, previousKeyId, overlapUntil, ...rest } = {}) {
    const created = await issueCredential({ logtoOrganizationId, connectionId, rotationOfKeyId: previousKeyId || null, ...rest });
    if (previousKeyId && overlapUntil) {
      const previous = await repository.findByKeyId(previousKeyId);
      if (previous && previous.logtoOrganizationId === logtoOrganizationId && previous.connectionId === connectionId && previous.status === 'active' && repository.updateExpiration) await repository.updateExpiration({ logtoOrganizationId, keyId: previousKeyId, expiresAt: normalizeDate(overlapUntil), updatedAt: clock() });
    }
    return created;
  }
  async function revokeCredential(args) { const row = await repository.revoke({ ...args, revokedAt: clock() }); return sanitizeCredential(row); }
  async function authenticate({ authorization, requiredScopes = [], ip = null, connectionId = null, logtoOrganizationId = null } = {}) {
    const parsed = parseBearerToken(authorization); if (!parsed) return { ok: false, reason: 'invalid_bearer_token' };
    const row = await repository.findByKeyId(parsed.keyId); const now = clock();
    if (!row || row.status !== 'active' || (logtoOrganizationId && row.logtoOrganizationId !== logtoOrganizationId) || (connectionId && row.connectionId !== connectionId) || (row.expiresAt && new Date(row.expiresAt) <= now) || !cidrAllows(ip, row.cidrAllowlist) || !scopeAllows(row.scopes, requiredScopes) || !verifySecretHash(parsed.secret, row.secretHash || row.secret_hash)) return { ok: false, reason: 'credential_not_authorized' };
    await repository.updateLastUsed({ keyId: row.keyId, lastUsedAt: now, ip });
    return { ok: true, credential: sanitizeCredential({ ...row, lastUsedAt: now, lastUsedIp: ip }) };
  }
  return { issueCredential, rotateCredential, revokeCredential, authenticate, repository };
}


function mapPostgresRow(row) {
  if (!row) return null;
  return { keyId: row.key_id, logtoOrganizationId: row.logto_organization_id, connectionId: row.connection_id, secretHash: row.secret_hash, scopes: row.scopes || [], status: row.status, cidrAllowlist: row.cidr_allowlist || [], expiresAt: row.expires_at, rotationOfKeyId: row.rotation_of_key_id, createdByLogtoUserId: row.created_by_logto_user_id, createdAt: row.created_at, updatedAt: row.updated_at, lastUsedAt: row.last_used_at, lastUsedIp: row.last_used_ip, revokedAt: row.revoked_at, revokedReason: row.revoked_reason };
}

function createPostgresScimCredentialRepository({ pool }) {
  if (!pool) throw new Error('pool is required');
  return {
    async insert(row) {
      const result = await pool.query(`insert into scim_connection_credentials(logto_organization_id,connection_id,key_id,secret_hash,scopes,status,cidr_allowlist,expires_at,rotation_of_key_id,created_by_logto_user_id,created_at,updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) returning *`, [row.logtoOrganizationId,row.connectionId,row.keyId,row.secretHash,row.scopes,row.status,row.cidrAllowlist,row.expiresAt,row.rotationOfKeyId,row.createdByLogtoUserId,row.createdAt]);
      return mapPostgresRow(result.rows[0]);
    },
    async findByKeyId(keyId) { const result = await pool.query('select * from scim_connection_credentials where key_id=$1 limit 1', [keyId]); return mapPostgresRow(result.rows[0]); },
    async updateExpiration({ logtoOrganizationId, keyId, expiresAt, updatedAt = new Date() }) { const result = await pool.query('update scim_connection_credentials set expires_at=$3, updated_at=$4 where logto_organization_id=$1 and key_id=$2 returning *', [logtoOrganizationId,keyId,expiresAt,updatedAt]); return mapPostgresRow(result.rows[0]); },
    async revoke({ logtoOrganizationId, keyId, revokedAt = new Date(), reason = 'revoked' }) { const result = await pool.query(`update scim_connection_credentials set status='revoked', revoked_at=$3, revoked_reason=$4, updated_at=$3 where logto_organization_id=$1 and key_id=$2 returning *`, [logtoOrganizationId,keyId,revokedAt,reason]); return mapPostgresRow(result.rows[0]); },
    async updateLastUsed({ keyId, lastUsedAt = new Date(), ip = null }) { const result = await pool.query('update scim_connection_credentials set last_used_at=$2,last_used_ip=$3,updated_at=$2 where key_id=$1 returning *', [keyId,lastUsedAt,ip]); return mapPostgresRow(result.rows[0]); },
    async listActiveForConnection({ logtoOrganizationId, connectionId, now = new Date() }) { const result = await pool.query(`select * from scim_connection_credentials where logto_organization_id=$1 and connection_id=$2 and status='active' and (expires_at is null or expires_at>$3) order by created_at desc`, [logtoOrganizationId,connectionId,now]); return result.rows.map(mapPostgresRow); },
  };
}

module.exports = { SCIM_CREDENTIAL_SCOPES, createScimCredentialService, InMemoryScimCredentialRepository, createPostgresScimCredentialRepository, generateSecret, parseBearerToken, hashSecret, verifySecretHash, cidrAllows };
