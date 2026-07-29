'use strict'
const { LogtoBootstrapError, classifyHttpError } = require('./errors')
const { redact } = require('./redaction')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
function retryAfterMs(headers = {}) { const value = headers['retry-after'] || headers['Retry-After']; if (!value) return null; const seconds = Number(value); if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000); const date = Date.parse(value); return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null }
function buildCorrelationId() { return `logto-authz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }
function createLogtoManagementApiClient(config, { transport = fetch, now = () => Date.now(), sleepFn = sleep, logger = console } = {}) {
  let tokenCache = null
  const requestJson = async (method, path, { body, signal, correlationId = buildCorrelationId(), allow404 = false, authenticated = true } = {}) => {
    const token = authenticated ? await getAccessToken({ signal }) : null
    const headers = { 'content-type': 'application/json', 'x-civitas-correlation-id': correlationId }
    if (token) headers.authorization = `Bearer ${token}`
    const url = path.startsWith('http') ? path : `${config.endpoint}${path}`
    return retryRequest(async () => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
      try {
        const response = await transport(url, { method, headers, body: body == null ? undefined : JSON.stringify(body), signal: controller.signal })
        const text = await response.text?.() ?? ''
        const payload = text ? JSON.parse(text) : null
        if (response.status === 404 && allow404) return null
        if (!response.ok) throw httpError(`Logto Management API ${method} ${path} failed`, response.status, payload, { method, path, correlationId, headers: Object.fromEntries(response.headers?.entries?.() || []) })
        return payload
      } finally { clearTimeout(timeout) }
    }, { label: `${method} ${path}`, logger })
  }
  const getAccessToken = async ({ signal } = {}) => {
    if (tokenCache && tokenCache.expiresAt - 30000 > now()) return tokenCache.accessToken
    const basic = Buffer.from(`${config.m2mAppId}:${config.m2mAppSecret}`).toString('base64')
    const body = new URLSearchParams({ grant_type: 'client_credentials', resource: config.managementApiResource, scope: 'all' })
    const response = await retryRequest(async () => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), config.timeoutMs)
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })
      try { return await transport(`${config.endpoint}/oidc/token`, { method: 'POST', headers: { authorization: `Basic ${basic}`, 'content-type': 'application/x-www-form-urlencoded' }, body, signal: controller.signal }) } finally { clearTimeout(timeout) }
    }, { label: 'POST /oidc/token', logger })
    const text = await response.text?.() ?? ''
    const payload = text ? JSON.parse(text) : null
    if (!response.ok) throw httpError('Logto M2M token request failed', response.status, payload, { method: 'POST', path: '/oidc/token' })
    tokenCache = { accessToken: payload.access_token, expiresAt: now() + Math.max(0, Number(payload.expires_in || 3600) * 1000) }
    return tokenCache.accessToken
  }
  async function retryRequest(factory, { label, logger }) {
    let attempt = 0
    while (true) {
      try { return await factory() } catch (error) {
        const status = error.status || (error.name === 'AbortError' ? 408 : null)
        const retryable = error.retryable ?? classifyHttpError(status).retryable
        if (!retryable || attempt >= config.maxRetries) throw error instanceof LogtoBootstrapError ? error : new LogtoBootstrapError(`${label} failed`, { code: 'LOGTO_REQUEST_FAILED', status, retryable, details: error })
        const headers = error.details?.headers || {}
        const delay = retryAfterMs(headers) ?? Math.min(2000, 100 * 2 ** attempt) + Math.floor(Math.random() * 25)
        logger.warn?.('logto management retry', redact({ label, attempt: attempt + 1, status, delay }))
        attempt += 1
        await sleepFn(delay)
      }
    }
  }
  const customJwtPath = config.customJwtScriptPath
  const assertCustomJwtPath = () => { if (!customJwtPath) throw new LogtoBootstrapError('LOGTO_CUSTOM_JWT_SCRIPT_PATH is required for deployed custom JWT operations', { code: 'LOGTO_CUSTOM_JWT_PATH_REQUIRED' }); return customJwtPath }
  const getCustomJwtScript = async () => requestJson('GET', assertCustomJwtPath(), { allow404: true })
  const replaceCustomJwtScript = async ({ source, expectedCurrentHash, idempotencyKey }) => {
    const current = await getCustomJwtScript()
    const currentSource = current?.script || current?.source || ''
    const currentHash = require('crypto').createHash('sha256').update(currentSource).digest('hex')
    if ((expectedCurrentHash || null) !== (current ? currentHash : null)) throw new LogtoBootstrapError('stale custom JWT script', { code: 'LOGTO_CUSTOM_JWT_SCRIPT_STALE', details: { expectedCurrentHash, currentHash: current ? currentHash : null } })
    return requestJson('PATCH', assertCustomJwtPath(), { body: { script: source }, correlationId: idempotencyKey })
  }
  return { requestJson, getAccessToken, getCustomJwtScript, replaceCustomJwtScript, clearTokenCache: () => { tokenCache = null } }
}
function httpError(message, status, body, details) { const retryable = classifyHttpError(status).retryable; return new LogtoBootstrapError(message, { code: status === 429 ? 'LOGTO_RATE_LIMITED' : 'LOGTO_HTTP_ERROR', status, retryable, details: { ...details, body } }) }
module.exports = { createLogtoManagementApiClient, retryAfterMs }
