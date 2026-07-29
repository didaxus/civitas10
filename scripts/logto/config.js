'use strict'
const { CivitasSharedContract } = require('../../core/shared/civitas-shared.contract.cjs')
const { LogtoBootstrapConfigError } = require('./errors')
const DEFAULTS = Object.freeze({ mode: 'check-rbac', maxConcurrency: 2, timeoutMs: 8000, maxRetries: 3 })
function readOptionalEnv(env, name) { const value = env[name]; return typeof value === 'string' && value.trim() ? value.trim() : null }
function requireHttpsUrl(value, name) { try { const url = new URL(value); if (url.protocol !== 'https:') throw new Error('not https'); return value.replace(/\/+$/, '') } catch { throw new LogtoBootstrapConfigError(`${name} must be a valid HTTPS URL`, { name }) } }
function parseInteger(env, name, fallback) { const raw = readOptionalEnv(env, name); if (!raw) return fallback; const value = Number.parseInt(raw, 10); if (!Number.isInteger(value) || value <= 0) throw new LogtoBootstrapConfigError(`${name} must be a positive integer`, { name }); return value }
function loadLogtoBootstrapConfig(env = process.env, { requireCredentials = false } = {}) {
  const endpoint = requireHttpsUrl(readOptionalEnv(env, 'LOGTO_ENDPOINT') || CivitasSharedContract.logto.issuer, 'LOGTO_ENDPOINT')
  const civitasApiResource = readOptionalEnv(env, 'LOGTO_CIVITAS_API_RESOURCE') || CivitasSharedContract.logto.apiResource
  if (civitasApiResource !== CivitasSharedContract.logto.apiResource) throw new LogtoBootstrapConfigError('LOGTO_CIVITAS_API_RESOURCE must match Civitas shared contract', { expected: CivitasSharedContract.logto.apiResource, actual: civitasApiResource })
  const managementApiResource = readOptionalEnv(env, 'LOGTO_MANAGEMENT_API_RESOURCE') || CivitasSharedContract.logto.managementApi
  requireHttpsUrl(managementApiResource, 'LOGTO_MANAGEMENT_API_RESOURCE')
  if (managementApiResource === civitasApiResource) throw new LogtoBootstrapConfigError('LOGTO_MANAGEMENT_API_RESOURCE must differ from Civitas API resource', { managementApiResource, civitasApiResource })
  const m2mAppId = readOptionalEnv(env, 'LOGTO_M2M_APP_ID')
  const m2mAppSecret = readOptionalEnv(env, 'LOGTO_M2M_APP_SECRET')
  const customJwtScriptPath = readOptionalEnv(env, 'LOGTO_CUSTOM_JWT_SCRIPT_PATH')
  if (customJwtScriptPath && !/^\/api\/[A-Za-z0-9_./:-]+$/.test(customJwtScriptPath)) throw new LogtoBootstrapConfigError('LOGTO_CUSTOM_JWT_SCRIPT_PATH must be an absolute Management API path', { customJwtScriptPath })
  if (requireCredentials && (!m2mAppId || !m2mAppSecret)) throw new LogtoBootstrapConfigError('LOGTO_M2M_APP_ID and LOGTO_M2M_APP_SECRET are required for remote Logto calls', { missing: ['LOGTO_M2M_APP_ID','LOGTO_M2M_APP_SECRET'].filter((name)=>!readOptionalEnv(env, name)) })
  return Object.freeze({ endpoint, managementApiResource, civitasApiResource, m2mAppId, m2mAppSecret, customJwtScriptPath, hasCredentials: Boolean(m2mAppId && m2mAppSecret), mode: readOptionalEnv(env, 'LOGTO_BOOTSTRAP_MODE') || DEFAULTS.mode, maxConcurrency: parseInteger(env, 'LOGTO_BOOTSTRAP_MAX_CONCURRENCY', DEFAULTS.maxConcurrency), timeoutMs: parseInteger(env, 'LOGTO_BOOTSTRAP_TIMEOUT_MS', DEFAULTS.timeoutMs), maxRetries: parseInteger(env, 'LOGTO_BOOTSTRAP_MAX_RETRIES', DEFAULTS.maxRetries) })
}
module.exports = { DEFAULTS, loadLogtoBootstrapConfig }
