const CAPABILITIES = Object.freeze([
  "identity",
  "lms",
  "crm",
  "marketing",
  "support",
  "scheduling",
  "payments",
  "email",
  "storage",
  "analytics",
  "community",
]);

const ADAPTER_HEALTH_STATUSES = Object.freeze({
  HEALTHY: "HEALTHY",
  DEGRADED: "DEGRADED",
  UNHEALTHY: "UNHEALTHY",
});

const ACTION_QUEUES = Object.freeze({
  PRIORITY_COMMANDS: "priority_commands",
  BACKGROUND_EVENTS: "background_events",
});

const OPERATION_STATUSES = Object.freeze({
  PENDING: "pending",
  PROCESSING: "processing",
  SUCCESS: "success",
  PARTIAL_SUCCESS: "partial_success",
  FAILED: "failed",
  COMPENSATING: "compensating",
  COMPENSATED: "compensated",
});

const OPERATION_TYPES = Object.freeze({
  IDENTITY_FEDERATION_RECONCILIATION_PLAN_CREATE: 'identity_federation.reconciliation_plan.create',
  IDENTITY_FEDERATION_RECONCILIATION_APPLY: 'identity_federation.reconciliation.apply',
});

const ITEM_STATUSES = Object.freeze({
  SUCCESS: "success",
  FAILED: "failed",
  SKIPPED: "skipped",
  DUPLICATE: "duplicate",
  RETRYABLE: "retryable",
  HUMAN_REQUIRED: "human_required",
  ORPHANED: "orphaned",
  COMPENSATED: "compensated",
});

const CANONICAL_PERMISSIONS = Object.freeze([
  "identity:read",
  "identity:write",
  "members:read",
  "members:invite",
  "members:remove",
  "seats:read",
  "seats:assign",
  "seats:release",
  "connectors:read",
  "connectors:configure",
  "lms:read",
  "lms:enroll",
  "lms:manage",
  "crm:read",
  "crm:write",
  "support:read",
  "support:write",
  "scheduling:read",
  "scheduling:book",
  "payments:read",
  "payments:manage",
  "audit:read",
  "impersonate:user",
]);

const assertKnownCapability = (capability) => {
  if (!CAPABILITIES.includes(capability)) {
    const error = new Error(`Unknown Civitas capability: ${capability}`);
    error.name = "UnknownCapabilityError";
    error.capability = capability;
    throw error;
  }
};

const createAdapterHealth = ({
  status = ADAPTER_HEALTH_STATUSES.HEALTHY,
  latencyMs = 0,
  lastSuccessfulPing = null,
  error = undefined,
  rateLimitRemaining = undefined,
  pendingEvents = undefined,
  backoffHintMs = undefined,
} = {}) => ({
  status,
  latency_ms: latencyMs,
  last_successful_ping: lastSuccessfulPing,
  ...(error ? { error } : {}),
  ...(rateLimitRemaining !== undefined ? { rate_limit_remaining: rateLimitRemaining } : {}),
  ...(pendingEvents !== undefined ? { pending_events: pendingEvents } : {}),
  ...(backoffHintMs !== undefined ? { backoff_hint_ms: backoffHintMs } : {}),
});

module.exports = {
  ACTION_QUEUES,
  ADAPTER_HEALTH_STATUSES,
  CAPABILITIES,
  CANONICAL_PERMISSIONS,
  ITEM_STATUSES,
  OPERATION_STATUSES,
  OPERATION_TYPES,
  assertKnownCapability,
  createAdapterHealth,
};
