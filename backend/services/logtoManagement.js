const { withTimeout } = require("./timeouts");
const { validateDeploymentConfig } = require("../../core/deployment/deployment-kernel.cjs");
const { loadCivitasSharedContract } = require("../../core/shared/contract-loader.cjs");
const sharedContract = loadCivitasSharedContract();
let deploymentConfigCache = null;

const getDeploymentConfig = () => {
  if (!deploymentConfigCache) {
    deploymentConfigCache = validateDeploymentConfig({ service: "backend" });
  }
  return deploymentConfigCache;
};

const { organizationRoles } = require("../../core/authz/roles/registry");

const MANAGEMENT_TOKEN_SCOPE = "all";
<<<<<<< ours
const ORGANIZATION_ADMIN_ROLE_KEY = "organization_admin";
const JIT_DEFAULT_ORGANIZATION_ROLE_KEY = "organization_student";
const LEGACY_ORGANIZATION_ADMIN_ROLE_DISPLAY_NAME = "Admin-org";
const LEGACY_JIT_DEFAULT_ORGANIZATION_ROLE_DISPLAY_NAME = "Student-org";
const REQUIRED_ORGANIZATION_ROLE_KEYS = [ORGANIZATION_ADMIN_ROLE_KEY, JIT_DEFAULT_ORGANIZATION_ROLE_KEY];
const CANONICAL_ORGANIZATION_ROLE_KEYS = new Set(organizationRoles);
const LEGACY_ORGANIZATION_ROLE_DISPLAY_NAMES_BY_KEY = Object.freeze({
  [ORGANIZATION_ADMIN_ROLE_KEY]: LEGACY_ORGANIZATION_ADMIN_ROLE_DISPLAY_NAME,
  [JIT_DEFAULT_ORGANIZATION_ROLE_KEY]: LEGACY_JIT_DEFAULT_ORGANIZATION_ROLE_DISPLAY_NAME,
});
const CANONICAL_ORGANIZATION_ROLE_KEYS_BY_LEGACY_DISPLAY_NAME = Object.freeze(Object.fromEntries(
  Object.entries(LEGACY_ORGANIZATION_ROLE_DISPLAY_NAMES_BY_KEY).map(([key, displayName]) => [displayName, key]),
));
=======
const AUTHORIZATION_CONTRACT_VERSION = sharedContract.version;
const ORGANIZATION_ADMIN_ROLE_NAME = sharedContract.auth.organization.roles.admin;
const ORGANIZATION_MEMBER_ROLE_NAME = sharedContract.auth.organization.roles.member;
const JIT_FALLBACK_ORGANIZATION_ROLE_NAME = ORGANIZATION_MEMBER_ROLE_NAME;
const JIT_PENDING_REVIEW_ROLE_NAME = "pending_review";
const CANONICAL_ORGANIZATION_ROLE_KEYS = Object.freeze(Object.values(sharedContract.auth.organization.roles));
const PROVISIONING_POLICY = Object.freeze({
  version: `${AUTHORIZATION_CONTRACT_VERSION}:jit-provisioning-policy-v1`,
  canonicalRoleKeySource: "sharedContract.auth.organization.roles",
  ownerPublishedMappingCeiling: "owner_ceiling_required_before_functional_role_materialization",
  tenantActivationApproval: "tenant_activation_required_before_functional_role_materialization",
  fallbackRoleNames: Object.freeze([JIT_FALLBACK_ORGANIZATION_ROLE_NAME, JIT_PENDING_REVIEW_ROLE_NAME]),
});
const REQUIRED_ORGANIZATION_ROLE_NAMES = [ORGANIZATION_ADMIN_ROLE_NAME, ORGANIZATION_MEMBER_ROLE_NAME];
>>>>>>> theirs
const PROHIBITED_ORGANIZATION_USER_GLOBAL_ROLE_NAMES = [sharedContract.auth.global.ownerRole];
const SENSITIVE_KEY_PATTERN = /(authorization|password|secret|token|credential|cookie|client[_-]?secret|api[_-]?key)/i;

let tokenCache = null;
let loggedManagementConfig = false;

const LOGTO_MANAGEMENT_TIMEOUT_MS = 8000;

function sanitizeForDiagnostics(value, depth = 0) {
  if (value == null) return value;
  if (depth > 4) return "[MaxDepth]";
  if (value instanceof Error) return { name: value.name, message: value.message, status: value.status, code: value.code };
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => sanitizeForDiagnostics(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, SENSITIVE_KEY_PATTERN.test(key) ? "[Redacted]" : sanitizeForDiagnostics(entry, depth + 1)]));
  }
  if (typeof value === "string") return value.length > 1000 ? `${value.slice(0, 1000)}…` : value;
  return value;
}

function sanitizePublicPath(path) {
  if (typeof path !== "string" || !path) return null;
  try {
    return new URL(path, "https://civitas.invalid").pathname || "/";
  } catch (error) {
    return path.split("?")[0] || null;
  }
}

function sanitizePublicRequest(request) {
  if (!request || typeof request !== "object") return null;
  return {
    method: request.method || "GET",
    path: sanitizePublicPath(request.path || null),
  };
}

function sanitizeValidationDetails(value, depth = 0) {
  if (value == null) return value;
  if (depth > 3) return "[MaxDepth]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeValidationDetails(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, entry]) => [key, sanitizeValidationDetails(entry, depth + 1)]));
  }
  if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  return value;
}

function sanitizePublicErrorBody(body) {
  if (!body || typeof body !== "object") return null;
  const sanitized = {};
  if (typeof body.reason === "string" && body.reason) sanitized.reason = body.reason;
  if (typeof body.message === "string" && body.message) sanitized.message = body.message.slice(0, 240);
  if (typeof body.code === "string" && body.code) sanitized.code = body.code;
  if (typeof body.status === "string" || Number.isInteger(body.status)) sanitized.status = body.status;
  if (Number.isInteger(body.timeoutMs)) sanitized.timeoutMs = body.timeoutMs;
  if (Array.isArray(body.missingRoleNames) && body.missingRoleNames.length > 0) sanitized.missingRoleNames = body.missingRoleNames.slice(0, 20);
  for (const key of ["availableRoleNames", "requiredRoleNames", "prohibitedRoleNames", "removedRoleNames", "retainedRoleNames", "unremovableRoleNames"]) {
    if (Array.isArray(body[key])) sanitized[key] = body[key].slice(0, 20);
  }
  if (typeof body.existingUser === "boolean") sanitized.existingUser = body.existingUser;
  if (typeof body.userId === "string") sanitized.userId = body.userId;
  for (const key of ["issues", "errors", "details", "data"]) {
    if (body[key] !== undefined) sanitized[key] = sanitizeValidationDetails(body[key]);
  }
  return Object.keys(sanitized).length ? sanitized : null;
}

class LogtoManagementApiError extends Error {
  constructor(message, { status, body, request, diagnostic } = {}) {
    super(message);
    this.name = "LogtoManagementApiError";
    this.status = status;
    this.body = sanitizePublicErrorBody(body);
    this.request = sanitizePublicRequest(request);
    this.diagnostic = null;
    this.internalBody = sanitizeForDiagnostics(body);
    this.internalRequest = request ? sanitizeForDiagnostics(request) : null;
    this.internalDiagnostic = diagnostic || null;
  }
}

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    const isManagementResource = false;
    const error = new LogtoManagementApiError(`${name} is required for Logto Management API`, {
      status: 500,
      body: {
        reason: "missing_logto_management_configuration",
        env: name,
        message: isManagementResource
          ? `Compiled Logto Management API resource must exactly match this Logto tenant.`
          : `${name} must be configured before Civitas can call Logto Management API.`,
      },
    });
    error.code = "LOGTO_MANAGEMENT_CONFIG_MISSING";
    error.internalDiagnostic = isManagementResource
      ? `Compiled Logto Management API resource is missing from the deployment kernel.`
      : `Missing environment variable ${name}; configure Logto M2M credentials before calling Civitas owner organization endpoints.`;
    throw error;
  }
  return value;
};

const normalizeEndpoint = (endpoint) => {
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:") {
    throw new LogtoManagementApiError("LOGTO_ENDPOINT must use HTTPS", { status: 500, body: { reason: "invalid_logto_endpoint_protocol" } });
  }
  if (!["", "/", "/oidc"].includes(parsed.pathname.replace(/\/+$/, "") || "/")) {
    throw new LogtoManagementApiError("LOGTO_ENDPOINT must point to the Logto tenant origin", { status: 500, body: { reason: "invalid_logto_endpoint_path" } });
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "").replace(/\/oidc$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
};
const encodePathSegment = (value) => encodeURIComponent(String(value));

const assertSeparateLogtoResources = (deploymentConfig) => {
  if (!deploymentConfig.logtoResource) {
    const error = new LogtoManagementApiError("LOGTO_API_RESOURCE is required for Civitas API authentication", {
      status: 500,
      body: { reason: "missing_civitas_api_resource", env: "LOGTO_API_RESOURCE" },
    });
    error.code = "LOGTO_API_RESOURCE_MISSING";
    throw error;
  }
  if (!deploymentConfig.logtoManagementApi) {
    const error = new LogtoManagementApiError("LOGTO_MANAGEMENT_API_RESOURCE is required for Logto Management API access", {
      status: 500,
      body: { reason: "missing_logto_management_resource", env: "LOGTO_MANAGEMENT_API_RESOURCE" },
    });
    error.code = "LOGTO_MANAGEMENT_RESOURCE_MISSING";
    throw error;
  }
  if (deploymentConfig.logtoManagementApi === deploymentConfig.logtoResource) {
    const error = new LogtoManagementApiError("LOGTO_MANAGEMENT_API_RESOURCE must be separate from LOGTO_API_RESOURCE", {
      status: 500,
      body: {
        reason: "logto_resource_collision",
        apiResourceSource: "LOGTO_API_RESOURCE",
        managementResourceSource: "LOGTO_MANAGEMENT_API_RESOURCE",
      },
    });
    error.code = "LOGTO_RESOURCE_COLLISION";
    error.internalDiagnostic = "Refusing to request a Logto Management API M2M token with the Civitas API audience.";
    throw error;
  }
};

const getLogtoManagementConfig = () => {
  const deploymentConfig = getDeploymentConfig();
  assertSeparateLogtoResources(deploymentConfig);
  const endpoint = normalizeEndpoint(deploymentConfig.logtoEndpoint);

  const config = {
    endpoint,
    tokenEndpoint: `${endpoint}/oidc/token`,
    clientId: getRequiredEnv("LOGTO_M2M_CLIENT_ID"),
    clientSecret: getRequiredEnv("LOGTO_M2M_CLIENT_SECRET"),
    resource: deploymentConfig.logtoManagementApi,
    resourceSource: "LOGTO_MANAGEMENT_API_RESOURCE",
  };

  if (!loggedManagementConfig) {
    loggedManagementConfig = true;
    console.info("[LogtoManagement] Using Logto Management API token configuration", {
      tokenEndpoint: config.tokenEndpoint,
      resource: config.resource,
      resourceSource: config.resourceSource,
      civitasApiResource: deploymentConfig.logtoResource,
      civitasApiResourceSource: "LOGTO_API_RESOURCE",
      scope: MANAGEMENT_TOKEN_SCOPE,
      clientIdConfigured: Boolean(config.clientId),
      clientSecretConfigured: Boolean(config.clientSecret),
    });
  }

  return config;
};

async function fetchLogtoManagementApiAccessToken() {
  if (tokenCache?.expiresAt && Date.now() < tokenCache.expiresAt - 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const config = getLogtoManagementConfig();
  let response;
  try {
    response = await withTimeout((signal) => fetch(config.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        resource: config.resource,
        scope: MANAGEMENT_TOKEN_SCOPE,
      }).toString(),
      signal,
    }), { timeoutMs: LOGTO_MANAGEMENT_TIMEOUT_MS, label: "Logto Management API token request" });
  } catch (error) {
    if (error.code === "INTEGRATION_TIMEOUT") {
      const timeoutError = new LogtoManagementApiError("Logto Management API token request timed out", { status: 504, body: { reason: "logto_management_token_timeout", timeoutMs: error.timeoutMs } });
      timeoutError.code = "LOGTO_MANAGEMENT_TOKEN_TIMEOUT";
      timeoutError.internalDiagnostic = `Network timeout while requesting Logto M2M token after ${error.timeoutMs}ms.`;
      timeoutError.diagnostic = timeoutError.internalDiagnostic;
      throw timeoutError;
    }
    throw error;
  }

  const tokenResponse = await response.json().catch(() => ({}));

  if (!response.ok || !tokenResponse.access_token) {
    throw new LogtoManagementApiError("Failed to obtain Logto Management API token", {
      status: response.status,
      body: tokenResponse,
      diagnostic: {
        tokenEndpoint: config.tokenEndpoint,
        resource: config.resource,
        resourceSource: config.resourceSource,
        scope: MANAGEMENT_TOKEN_SCOPE,
      },
    });
  }

  tokenCache = {
    token: tokenResponse.access_token,
    expiresAt: Date.now() + (tokenResponse.expires_in || 3600) * 1000,
  };

  return tokenCache.token;
}

async function parseLogtoManagementApiResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const body = await response.text();
  if (!body) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(body);
    } catch (error) {
      throw new LogtoManagementApiError("Logto Management API returned invalid JSON", {
        status: response.status,
        body,
      });
    }
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    return {
      status: response.status,
      contentType,
      rawBody: body,
    };
  }
}

const parseRequestBodyForDiagnostics = (body) => {
  if (!body) return undefined;
  if (typeof body !== "string") return "[non-string body]";
  try {
    return JSON.parse(body);
  } catch (error) {
    return body;
  }
};

async function callLogtoManagementApi(path, options = {}) {
  const accessToken = await fetchLogtoManagementApiAccessToken();
  const { endpoint } = getLogtoManagementConfig();
  const request = { method: options.method || "GET", path, payload: parseRequestBodyForDiagnostics(options.body) };
  let response;
  try {
    response = await withTimeout((signal) => fetch(`${endpoint}/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        ...options.headers,
      },
      signal,
    }), { timeoutMs: LOGTO_MANAGEMENT_TIMEOUT_MS, label: `Logto Management API ${request.method} ${path}` });
  } catch (error) {
    if (error.code === "INTEGRATION_TIMEOUT") {
      const timeoutError = new LogtoManagementApiError("Logto Management API request timed out", { status: 504, body: { reason: "logto_management_request_timeout", timeoutMs: error.timeoutMs }, request });
      timeoutError.code = "LOGTO_MANAGEMENT_REQUEST_TIMEOUT";
      timeoutError.internalDiagnostic = `Network timeout while calling Logto Management API ${request.method} ${path} after ${error.timeoutMs}ms.`;
      timeoutError.diagnostic = timeoutError.internalDiagnostic;
      throw timeoutError;
    }
    throw error;
  }

  const parsedBody = await parseLogtoManagementApiResponse(response);

  if (!response.ok) {
    throw new LogtoManagementApiError("Logto Management API request failed", { status: response.status, body: parsedBody, request });
  }

  return parsedBody;
}

async function createLogtoOrganization({ name, description, customData }) {
  return callLogtoManagementApi("/organizations", {
    method: "POST",
    body: JSON.stringify({ name, description: description || undefined, customData: customData || undefined }),
  });
}

async function updateLogtoOrganizationCustomData({ organizationId, customData }) {
  return callLogtoManagementApi(`/organizations/${encodePathSegment(organizationId)}`, {
    method: "PATCH",
    body: JSON.stringify({ customData }),
  });
}

async function updateLogtoOrganization({ organizationId, name, description, customData }) {
  return callLogtoManagementApi(`/organizations/${encodePathSegment(organizationId)}`, {
    method: "PATCH",
    body: JSON.stringify({ name: name || undefined, description: description || undefined, customData: customData || undefined }),
  });
}

async function getLogtoOrganizationById(organizationId) {
  return callLogtoManagementApi(`/organizations/${encodePathSegment(organizationId)}`);
}

async function addUserToLogtoOrganization({ organizationId, userId }) {
  return callLogtoManagementApi(`/organizations/${encodePathSegment(organizationId)}/users`, {
    method: "POST",
    body: JSON.stringify({ userIds: [userId] }),
  });
}

async function replaceJitEmailDomainsForLogtoOrganization({ organizationId, emailDomains }) {
  return callLogtoManagementApi(`/organizations/${encodePathSegment(organizationId)}/jit/email-domains`, {
    method: "PUT",
    body: JSON.stringify({ emailDomains }),
  });
}

async function replaceJitDefaultRolesForLogtoOrganization({ organizationId, organizationRoleIds }) {
  return callLogtoManagementApi(`/organizations/${encodePathSegment(organizationId)}/jit/roles`, {
    method: "PUT",
    body: JSON.stringify({ organizationRoleIds }),
  });
}

async function listLogtoOrganizationRoles() {
  const pageSize = 100;
  const roles = [];
  for (let page = 1; page <= 100; page += 1) {
    const response = await callLogtoManagementApi(`/organization-roles?page=${page}&page_size=${pageSize}`);
    const batch = normalizeRoleListResponse(response);
    roles.push(...batch);
    if (batch.length < pageSize) break;
  }
  return roles;
}

const getOrganizationRoleName = (role = {}) => role.name || role.nameCache || role.key || null;
const getOrganizationRoleId = (role = {}) => role.id || role.organizationRoleId || role.roleId || null;
const getGlobalRoleName = (role = {}) => role.name || role.nameCache || role.key || null;
const getGlobalRoleId = (role = {}) => role.id || role.roleId || null;

function getAllowedOrganizationUserGlobalRoleNames() {
  return [];
}

const normalizeRoleListResponse = (response) => (Array.isArray(response) ? response : response?.data || response?.items || []);

function normalizeRequiredOrganizationRoleKeys({ requiredRoleKeys, requiredRoleNames } = {}) {
  const requested = requiredRoleKeys || requiredRoleNames || REQUIRED_ORGANIZATION_ROLE_KEYS;
  return requested.map((roleKey) => {
    const canonicalKey = CANONICAL_ORGANIZATION_ROLE_KEYS_BY_LEGACY_DISPLAY_NAME[roleKey] || roleKey;
    if (!CANONICAL_ORGANIZATION_ROLE_KEYS.has(canonicalKey)) {
      throw new LogtoManagementApiError(`Unknown canonical organization role key: ${roleKey}`, {
        status: 500,
        body: { reason: "unknown_canonical_organization_role_key", roleKey },
      });
    }
    return canonicalKey;
  });
}

function resolveCanonicalOrganizationRoleFromLogtoRole(role = {}) {
  const roleName = getOrganizationRoleName(role);
  const canonicalKey = CANONICAL_ORGANIZATION_ROLE_KEYS.has(roleName)
    ? roleName
    : CANONICAL_ORGANIZATION_ROLE_KEYS_BY_LEGACY_DISPLAY_NAME[roleName] || null;
  return {
    ...role,
    id: getOrganizationRoleId(role),
    name: roleName,
    canonicalKey,
    legacyDisplayName: canonicalKey ? LEGACY_ORGANIZATION_ROLE_DISPLAY_NAMES_BY_KEY[canonicalKey] || null : null,
    resolvedBy: canonicalKey === roleName ? "canonical_role_key" : (canonicalKey ? "legacy_display_name_mapping" : null),
  };
}

async function findOrganizationRoleByName(name) {
  const roles = await listLogtoOrganizationRoles();
  return roles.find((role) => getOrganizationRoleName(role) === name) || null;
}

async function findOrganizationRoleByCanonicalKey(roleKey) {
  const requiredRoleKeys = normalizeRequiredOrganizationRoleKeys({ requiredRoleKeys: [roleKey] });
  const roles = await listLogtoOrganizationRoles();
  const normalizedRoles = roles.map(resolveCanonicalOrganizationRoleFromLogtoRole);
  return normalizedRoles.find((role) => role.canonicalKey === requiredRoleKeys[0]) || null;
}

async function validateOrganizationTemplate({ requiredRoleKeys, requiredRoleNames } = {}) {
  const resolvedRequiredRoleKeys = normalizeRequiredOrganizationRoleKeys({ requiredRoleKeys, requiredRoleNames });
  const roles = await listLogtoOrganizationRoles();
  const normalizedRoles = roles.map(resolveCanonicalOrganizationRoleFromLogtoRole);
  const availableCanonicalRoleKeys = normalizedRoles.map((role) => role.canonicalKey).filter(Boolean);
  const missingRoleKeys = resolvedRequiredRoleKeys.filter((roleKey) => !availableCanonicalRoleKeys.includes(roleKey));

  return {
    ok: missingRoleKeys.length === 0,
    requiredRoleKeys: resolvedRequiredRoleKeys,
    missingRoleKeys,
    requiredRoleNames: resolvedRequiredRoleKeys,
    missingRoleNames: missingRoleKeys,
    roles: normalizedRoles,
  };
}

async function ensureOrganizationTemplate({ requiredRoleKeys, requiredRoleNames } = {}) {
  const template = await validateOrganizationTemplate({ requiredRoleKeys, requiredRoleNames });
  if (!template.ok) {
    const error = new LogtoManagementApiError(`Logto organization template is missing required canonical role key(s): ${template.missingRoleKeys.join(", ")}`, {
      status: 424,
      body: {
        reason: "organization_template_missing_roles",
        requiredRoleKeys: template.requiredRoleKeys,
        missingRoleKeys: template.missingRoleKeys,
        requiredRoleNames: template.requiredRoleKeys,
        missingRoleNames: template.missingRoleKeys,
        availableRoleNames: template.roles.map((role) => role.name).filter(Boolean),
      },
    });
    error.code = "LOGTO_ORGANIZATION_TEMPLATE_MISSING_ROLES";
    error.missingRoleKeys = template.missingRoleKeys;
    error.missingRoleNames = template.missingRoleKeys;
    throw error;
  }
  return template;
}

async function findLogtoOrganizationByName(name) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    return null;
  }

  const organizations = await listLogtoOrganizations();
  return organizations.find((organization) => organization?.name === normalizedName || organization?.nameCache === normalizedName) || null;
}

async function assignOrganizationRoleToUser({ organizationId, userId, organizationRoleId, organizationRoleName }) {
  const rolePayload = organizationRoleId
    ? { organizationRoleIds: [organizationRoleId] }
    : { organizationRoleNames: [organizationRoleName] };
  return callLogtoManagementApi(`/organizations/${encodePathSegment(organizationId)}/users/${encodePathSegment(userId)}/roles`, {
    method: "POST",
    body: JSON.stringify(rolePayload),
  });
}

async function getLogtoUserById(userId) {
  return callLogtoManagementApi(`/users/${encodePathSegment(userId)}`);
}

function normalizeLogtoPrimaryPhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits || undefined;
}

async function updateLogtoUser({ userId, email, primaryEmail, name, phone, primaryPhone, username, profile, customData }) {
  return callLogtoManagementApi(`/users/${encodePathSegment(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      primaryEmail: primaryEmail || email || undefined,
      name: name || undefined,
      primaryPhone: normalizeLogtoPrimaryPhone(primaryPhone || phone),
      username: username || undefined,
      profile: profile && Object.keys(profile).length ? profile : undefined,
      customData: customData && Object.keys(customData).length ? customData : undefined,
    }),
  });
}

async function createLogtoUserPasswordResetRequest() {
  const error = new LogtoManagementApiError("Logto admin password reset is disabled for Civitas", {
    status: 501,
    body: {
      reason: "unsupported_safe_reset",
      policy: "No local password reset is created. Use Logto hosted reset-password flow instead.",
    },
  });
  error.code = "LOGTO_UNSUPPORTED_CAPABILITY";
  throw error;
}

async function listLogtoUsers({ search } = {}) {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const response = await callLogtoManagementApi(`/users${params.toString() ? `?${params}` : ""}`);
  return Array.isArray(response) ? response : response?.data || response?.items || [];
}

async function listLogtoOrganizationUsers({ organizationId }) {
  const response = await callLogtoManagementApi(`/organizations/${encodeURIComponent(organizationId)}/users`);
  return Array.isArray(response) ? response : response?.data || response?.items || [];
}

async function listLogtoOrganizationUserRoles({ organizationId, userId }) {
  const response = await callLogtoManagementApi(`/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(userId)}/roles`);
  return normalizeRoleListResponse(response).map((role) => ({ ...role, id: getOrganizationRoleId(role), name: getOrganizationRoleName(role) }));
}

async function removeUserFromLogtoOrganization({ organizationId, userId }) {
  return callLogtoManagementApi(`/organizations/${encodeURIComponent(organizationId)}/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
  });
}

async function listLogtoUserGlobalRoles({ userId }) {
  return normalizeRoleListResponse(await callLogtoManagementApi(`/users/${encodeURIComponent(userId)}/roles`))
    .map((role) => ({ ...role, id: getGlobalRoleId(role), name: getGlobalRoleName(role) }));
}

async function removeLogtoUserGlobalRole({ userId, roleId }) {
  return callLogtoManagementApi(`/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`, {
    method: "DELETE",
  });
}

async function removeProhibitedLogtoUserGlobalRoles({
  userId,
  allowedRoleNames = getAllowedOrganizationUserGlobalRoleNames(),
  removeProhibitedRoles = false,
} = {}) {
  const allowed = new Set(allowedRoleNames);
  const globalRoles = await listLogtoUserGlobalRoles({ userId });
  const prohibitedRoles = globalRoles.filter((role) => !allowed.has(role.name));
  const removedRoles = [];
  const unremovableRoles = [];
  const retainedRoles = [];

  if (!removeProhibitedRoles) {
    return { allowedRoleNames, globalRoles, prohibitedRoles, removedRoles, unremovableRoles, retainedRoles: prohibitedRoles };
  }

  for (const role of prohibitedRoles) {
    if (!role.id) {
      unremovableRoles.push(role);
      retainedRoles.push(role);
      continue;
    }
    await removeLogtoUserGlobalRole({ userId, roleId: role.id });
    removedRoles.push(role);
  }

  return { allowedRoleNames, globalRoles, prohibitedRoles, removedRoles, unremovableRoles, retainedRoles };
}

function buildProhibitedGlobalRolesError({ userId, prohibitedRoles, removedRoles = [], unremovableRoles = [], retainedRoles = [], existingUser = false }) {
  const prohibitedRoleNames = prohibitedRoles.map((role) => role.name).filter(Boolean);
  const error = new LogtoManagementApiError(`Organization user has prohibited global role(s): ${prohibitedRoleNames.join(", ") || "unknown"}`, {
    status: 424,
    body: {
      reason: "organization_user_prohibited_global_roles",
      userId,
      prohibitedRoleNames,
      removedRoleNames: removedRoles.map((role) => role.name).filter(Boolean),
      unremovableRoleNames: unremovableRoles.map((role) => role.name).filter(Boolean),
      retainedRoleNames: retainedRoles.map((role) => role.name).filter(Boolean),
      existingUser,
    },
  });
  error.code = "LOGTO_ORGANIZATION_USER_PROHIBITED_GLOBAL_ROLES";
  error.prohibitedRoles = prohibitedRoles;
  error.removedRoles = removedRoles;
  error.unremovableRoles = unremovableRoles;
  error.retainedRoles = retainedRoles;
  error.internalDiagnostic = existingUser
    ? "An existing Logto user has global roles incompatible with being an organization base admin. Civitas did not mutate the existing user; choose a different base admin or remove the incompatible global roles manually after verifying ownership."
    : "Logto assigned a global role to a newly created organization user. Civitas attempted to remove unsafe default global roles; remove default global roles for regular users because the shared owner role must be reserved for Civitas platform owners.";
  error.diagnostic = error.internalDiagnostic;
  return error;
}

async function enforceNoProhibitedGlobalRolesForOrganizationUser({
  userId,
  allowedRoleNames = getAllowedOrganizationUserGlobalRoleNames(),
  removeProhibitedRoles = false,
  existingUser = !removeProhibitedRoles,
} = {}) {
  const result = await removeProhibitedLogtoUserGlobalRoles({ userId, allowedRoleNames, removeProhibitedRoles });
  if (result.prohibitedRoles.length > 0) {
    throw buildProhibitedGlobalRolesError({ userId, existingUser, ...result });
  }
  return result;
}

const getLogtoUserId = (user = {}) => user.id || user.userId || user.logtoUserId || null;
const getLogtoUserEmail = (user = {}) => (user.primaryEmail || user.email || user.profile?.email || "").toLowerCase() || null;
const getLogtoUserPhone = (user = {}) => normalizeLogtoPrimaryPhone(user.primaryPhone || user.phone || user.profile?.phoneNumber || user.profile?.phone_number || "") || null;
const getLogtoUsername = (user = {}) => user.username || user.profile?.preferredUsername || null;

async function findLogtoUserByEmail(email) {
  const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
  if (!normalizedEmail) return null;
  const users = await listLogtoUsers({ search: normalizedEmail });
  return users.find((user) => getLogtoUserEmail(user) === normalizedEmail) || null;
}

async function findLogtoUserByPhone(phone) {
  const normalizedPhone = normalizeLogtoPrimaryPhone(phone);
  if (!normalizedPhone) return null;
  const users = await listLogtoUsers({ search: normalizedPhone });
  return users.find((user) => getLogtoUserPhone(user) === normalizedPhone) || null;
}

async function findLogtoUserByUsername(username) {
  const normalizedUsername = typeof username === "string" ? username.trim() : "";
  if (!normalizedUsername) return null;
  const users = await listLogtoUsers({ search: normalizedUsername });
  return users.find((user) => getLogtoUsername(user) === normalizedUsername) || null;
}

function logtoValidationMentions(error, field) {
  const haystack = JSON.stringify(error?.internalBody || error?.body || {}).toLowerCase();
  return haystack.includes(String(field).toLowerCase());
}

async function createLogtoUser({ email, primaryEmail, name, phone, primaryPhone, username, profile, customData }) {
  return callLogtoManagementApi("/users", {
    method: "POST",
    body: JSON.stringify({
      primaryEmail: primaryEmail || email,
      name,
      username: username || undefined,
      ...(normalizeLogtoPrimaryPhone(primaryPhone || phone) ? { primaryPhone: normalizeLogtoPrimaryPhone(primaryPhone || phone) } : {}),
      profile: profile && Object.keys(profile).length ? profile : undefined,
      customData: customData && Object.keys(customData).length ? customData : undefined,
    }),
  });
}

async function createOrResolveLogtoUserByEmail({ email, primaryEmail, name, phone, primaryPhone, username, profile, customData }) {
  email = primaryEmail || email;
  phone = primaryPhone || phone;
  const normalizedPhone = normalizeLogtoPrimaryPhone(phone);
  const existingUser = await findLogtoUserByEmail(email);
  if (existingUser) {
    const userId = getLogtoUserId(existingUser);
    const phoneOwner = normalizedPhone ? await findLogtoUserByPhone(normalizedPhone) : null;
    const phoneConflict = phoneOwner && getLogtoUserId(phoneOwner) !== userId;
    if (userId && (name || phone || username || profile || customData)) {
      const updated = await updateLogtoUser({ userId, email, name, phone: phoneConflict ? null : phone, username, profile, customData });
      return { user: updated || existingUser, created: false, source: phoneConflict ? "email_lookup_updated_phone_omitted" : "email_lookup_updated", reconciliation: phoneConflict ? { omittedFields: ["primaryPhone"], reason: "primary_phone_belongs_to_different_logto_user", conflictingUserId: getLogtoUserId(phoneOwner) } : undefined };
    }
    return { user: existingUser, created: false, source: "email_lookup" };
  }

  const phoneOwner = normalizedPhone ? await findLogtoUserByPhone(normalizedPhone) : null;
  const phoneConflict = phoneOwner && getLogtoUserEmail(phoneOwner) !== String(email || "").toLowerCase();
  const basePayload = { email, name, phone: phoneConflict ? null : phone, username, profile, customData };
  const baseReconciliation = phoneConflict ? { omittedFields: ["primaryPhone"], reason: "primary_phone_belongs_to_different_logto_user", conflictingUserId: getLogtoUserId(phoneOwner) } : undefined;

  try {
    return { user: await createLogtoUser(basePayload), created: true, source: phoneConflict ? "create_user_phone_omitted" : "create_user", reconciliation: baseReconciliation };
  } catch (error) {
    if (error instanceof LogtoManagementApiError && [400, 409, 422].includes(error.status)) {
      const reconciledUser = await findLogtoUserByEmail(email);
      if (reconciledUser) return { user: reconciledUser, created: false, source: "post_create_email_lookup" };
      if (normalizedPhone && !phoneConflict && logtoValidationMentions(error, "phone")) {
        const retryPhoneOwner = await findLogtoUserByPhone(normalizedPhone);
        const retryReconciliation = { omittedFields: ["primaryPhone"], reason: "primary_phone_rejected_by_logto_validation", conflictingUserId: getLogtoUserId(retryPhoneOwner) };
        return { user: await createLogtoUser({ email, name, username, profile, customData }), created: true, source: "create_user_after_phone_validation_omitted", reconciliation: retryReconciliation };
      }
      if (username) {
        for (let suffix = 1; suffix <= 20; suffix += 1) {
          try {
            const suffixText = String(suffix);
            const fallbackUsername = `${username.slice(0, Math.max(1, 128 - suffixText.length))}${suffixText}`;
            return { user: await createLogtoUser({ ...basePayload, username: fallbackUsername, profile: { ...(profile || {}), preferredUsername: fallbackUsername } }), created: true, source: "create_user_username_suffix", username: fallbackUsername, reconciliation: baseReconciliation };
          } catch (retryError) {
            if (!(retryError instanceof LogtoManagementApiError) || ![400, 409, 422].includes(retryError.status)) throw retryError;
          }
        }
      }
    }
    throw error;
  }
}

async function listLogtoOrganizations() {
  const response = await callLogtoManagementApi("/organizations");
  return Array.isArray(response) ? response : response?.data || response?.items || [];
}

module.exports = {
<<<<<<< ours
  ORGANIZATION_ADMIN_ROLE_KEY,
  JIT_DEFAULT_ORGANIZATION_ROLE_KEY,
  LEGACY_ORGANIZATION_ADMIN_ROLE_DISPLAY_NAME,
  LEGACY_JIT_DEFAULT_ORGANIZATION_ROLE_DISPLAY_NAME,
  REQUIRED_ORGANIZATION_ROLE_KEYS,
  LEGACY_ORGANIZATION_ROLE_DISPLAY_NAMES_BY_KEY,
  CANONICAL_ORGANIZATION_ROLE_KEYS_BY_LEGACY_DISPLAY_NAME,
=======
  ORGANIZATION_ADMIN_ROLE_NAME,
  ORGANIZATION_MEMBER_ROLE_NAME,
  JIT_FALLBACK_ORGANIZATION_ROLE_NAME,
  JIT_PENDING_REVIEW_ROLE_NAME,
  CANONICAL_ORGANIZATION_ROLE_KEYS,
  PROVISIONING_POLICY,
  REQUIRED_ORGANIZATION_ROLE_NAMES,
>>>>>>> theirs
  PROHIBITED_ORGANIZATION_USER_GLOBAL_ROLE_NAMES,
  LogtoManagementApiError,
  replaceJitDefaultRolesForLogtoOrganization,
  replaceJitEmailDomainsForLogtoOrganization,
  addUserToLogtoOrganization,
  assignOrganizationRoleToUser,
  createLogtoOrganization,
  createLogtoUser,
  createOrResolveLogtoUserByEmail,
  enforceNoProhibitedGlobalRolesForOrganizationUser,
  getAllowedOrganizationUserGlobalRoleNames,
  listLogtoUserGlobalRoles,
  removeLogtoUserGlobalRole,
  removeUserFromLogtoOrganization,
  removeProhibitedLogtoUserGlobalRoles,
  updateLogtoOrganizationCustomData,
  updateLogtoOrganization,
  updateLogtoUser,
  createLogtoUserPasswordResetRequest,
  fetchLogtoManagementApiAccessToken,
  findLogtoOrganizationByName,
  ensureOrganizationTemplate,
  findOrganizationRoleByName,
  findOrganizationRoleByCanonicalKey,
  getLogtoManagementConfig,
  getLogtoUserById,
  getLogtoOrganizationById,
  findLogtoUserByEmail,
  findLogtoUserByPhone,
  findLogtoUserByUsername,
  listLogtoOrganizationRoles,
  listLogtoOrganizationUsers,
  listLogtoOrganizationUserRoles,
  listLogtoUsers,
  validateOrganizationTemplate,
  parseLogtoManagementApiResponse,
  listLogtoOrganizations,
};
