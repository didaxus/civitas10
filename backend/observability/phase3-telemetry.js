'use strict';

const crypto = require('node:crypto');

const SENSITIVE_KEY = /(?:authorization|cookie|token|secret|password|credential|email|phone|address|payload|body)/i;
const CANONICAL_IDS = ['correlationId', 'traceId', 'spanId', 'operationId', 'tenantId', 'moduleId', 'contractId', 'contractVersion'];

function redact(value, depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    key,
    SENSITIVE_KEY.test(key) ? '[REDACTED]' : redact(entry, depth + 1),
  ]));
}

function canonicalContext(input = {}) {
  const context = Object.fromEntries(CANONICAL_IDS.map((key) => [key, input[key] ?? null]));
  if (!context.correlationId) context.correlationId = crypto.randomUUID();
  if (!context.traceId) context.traceId = crypto.randomBytes(16).toString('hex');
  if (!context.spanId) context.spanId = crypto.randomBytes(8).toString('hex');
  if (!/^[0-9a-f]{32}$/.test(context.traceId) || !/^[0-9a-f]{16}$/.test(context.spanId)) {
    throw new Error('OBSERVABILITY_CANONICAL_TRACE_ID_INVALID');
  }
  return Object.freeze(context);
}

function createTelemetry({ service, version, environment, sink = console.log, clock = () => new Date() }) {
  if (!service || !version || !environment) throw new Error('OBSERVABILITY_RESOURCE_IDENTITY_REQUIRED');
  const resource = Object.freeze({ service, version, environment });
  function log(level, event, fields = {}, ids = {}) {
    const record = redact({ timestamp: clock().toISOString(), level, event, ...resource, ...canonicalContext(ids), fields });
    sink(JSON.stringify(record));
    return record;
  }
  function metric(name, value, attributes = {}, ids = {}) {
    return log('info', 'metric', { name, value, attributes }, ids);
  }
  function span(name, ids = {}) {
    const context = canonicalContext(ids);
    const started = clock();
    return {
      context,
      end(status = 'ok', fields = {}) {
        return log(status === 'ok' ? 'info' : 'error', 'span.end', {
          name, status, durationMs: Math.max(0, clock() - started), ...fields,
        }, context);
      },
    };
  }
  return Object.freeze({ log, metric, span, resource });
}

module.exports = { CANONICAL_IDS, SENSITIVE_KEY, canonicalContext, createTelemetry, redact };
