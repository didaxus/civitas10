const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { validateDeploymentConfig } = require("../core/deployment/deployment-kernel.cjs");
const { requireAuth, requireGlobalAccess, requireOrganizationAccess, requireOrganizationRole } = require("./middleware/auth");
const { requireOrg } = require("./middleware/requireOrg");
const { requirePermission } = require("./middleware/requirePermission");
const { requireAuthorization } = require("./authorization/policies");
const { createSecurityPolicyRegistry } = require("./middleware/securityPolicies");
const {
  listLogtoOrganizations,
  listLogtoOrganizationRoles,
  listLogtoOrganizationUsers,
  listLogtoOrganizationUserRoles,
  assignOrganizationRoleToUser,
  getLogtoOrganizationById,
} = require("./services/logtoManagement");
const {
  normalizeProvisioningInput,
  runCanonicalOrganizationProvisioning,
} = require("./services/organizationProvisioningCore");
const { buildConsolidatedOperationalResponse } = require("./services/operationalStateAssembler");
const { buildOperationalOrganization, deriveOperationalProfile, getLogtoOrganizationId, getLogtoOrganizationName } = require("./services/ownerOperationalProfile");
const { listRuntimeState } = require("./services/organizationRuntimeState");
const { getWorkerHealthSnapshot, loadWorkerHealthSnapshot, loadWorkerQueuesObservability } = require("./services/operationalObservability");
const { getDatabaseHealth } = require("./lib/databaseHealth");
const { getRedisHealth } = require("./lib/redisHealth");
const { validateRuntimeEnv, waitForDatabase } = require("./runtime/env");
const { prepareOperationalDatabase } = require("./runtime/migrations");
const { ensureLocationCatalog } = require("./scripts/ensure-location-catalog");
const { pingDatabase } = require("./lib/db");
const { createOperation, listOperationalState } = require("./services/operationalOperations");
const { listRegistry, loadConnectorRows } = require("./services/registryStore");
const { createOrganizationProvisioningRecorder } = require("./services/organizationProvisioningRecorder");
const { createIdempotencyKey, getOrganizationProvisioningDraft, saveOrganizationProvisioningDraft } = require("./services/organizationProvisioningDrafts");
const { buildBootstrapStatus } = require("./services/ownerBootstrapStatus");
const { OWNER_CAPABILITIES, buildOwnerOperationalStateResponse } = require("./services/ownerCapabilitySurfaces");
const { buildGovernanceReadModel, assertTenantRouteMatchesContext } = require("./services/governanceReadModel");
const { updateOwnerCeilings, updateTenantActivations, roleMapFromRoles, entitlementRepository } = require("./services/governanceRolesReadModel");
const { createTaxonomyValue, publishTaxonomy, createUnit: createGovernanceUnit, activateUnit: activateGovernanceUnit, createDataScope, safeActor, dataScopeRepository } = require("./services/governanceStructureReadModel");
const { updateNavigationPreferences, previewAccess, listGovernanceAuditEvents, listGovernanceAuditPage, getGovernanceAuditEvent, exportGovernanceAuditEvents, actorId } = require("./services/governanceOperationsReadModel");
const { requireGlobalOwner } = require("./authorization/guards");
const { organizationPath } = require("./routes/tenantRoutes");
const { emptyCatalogPayload, getCatalogHealth, getCountryPhoneCode, listCities, listCountries, listStatesByCountry, parsePositiveInteger, searchLocations } = require("./services/locations");
const { createLmsGroupLeadershipService } = require("./lms/groupLeadershipService");
const { registerIdentityFederationRoutes } = require("./routes/identityFederationRoutes");
const { registerScimReconciliationRoutes } = require("./routes/scimReconciliationRoutes");
const { registerScimUserRoutes } = require("./scim/users/routes");
const { registerPlanningRoutes } = require("./planning/presentation/routes");
const { buildPrincipalForRest } = require("./authorization/principalBuilder");

const app = express();
const port = 3000;
const deploymentConfig = validateDeploymentConfig({ service: "backend" });
const SHARED_AUTH = deploymentConfig.contract.auth;
const API_RESOURCE = deploymentConfig.logtoResource;
const OWNER_GLOBAL_ROLE = SHARED_AUTH.global.ownerRole;
const OWNER_AUTHZ = SHARED_AUTH.global.permissions;
const ORG_AUTHZ = SHARED_AUTH.organization.documentPermissions;

app.use(cors());
// Planning presentation owns request parsing for its mounted API routes.
registerPlanningRoutes(app);
// Orden canónico de middlewares tenant: requireOrganizationAccess → requireOrg → requirePermission → requireSeats (solo si aplica) → handler.
const secureRoute = createSecurityPolicyRegistry({ app });

const summarizeStatus = (statuses) => {
  if (statuses.includes("unhealthy")) return "unhealthy";
  if (statuses.includes("degraded")) return "degraded";
  return "healthy";
};

const getLogtoConfigHealth = () => {
  const required = ["LOGTO_M2M_CLIENT_ID", "LOGTO_M2M_CLIENT_SECRET"];
  const missing = required.filter((name) => !process.env[name]);
  return { status: missing.length ? "unhealthy" : "healthy", configured: missing.length === 0, missing };
};

const getWorkerReadiness = () => ({
  status: process.env.REDIS_URL ? "healthy" : "degraded",
  queueConfigured: Boolean(process.env.REDIS_URL),
  message: process.env.REDIS_URL
    ? "Worker runtime can publish heartbeat and queue state to the owner backbone."
    : "Configure REDIS_URL to enable worker queue execution and heartbeat publishing.",
});


const SAFE_PUBLIC_ERROR_NAMES = new Set(["LogtoManagementApiError"]);
const sanitizePublicErrorResponse = (error, fallbackName, fallbackMessage) => {
  const rawStatus = error && Number.isInteger(error.status) ? error.status : 500;
  const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  const safeError = error && (status < 500 || SAFE_PUBLIC_ERROR_NAMES.has(error.name)) ? error : null;
  if (safeError?.error === "invalid_initial_organization_role") {
    return {
      status,
      body: {
        error: safeError.error,
        message: safeError.message,
        requestedRole: safeError.requestedRole,
        availableRoles: safeError.availableRoles || [],
      },
    };
  }
  return {
    status,
    body: {
      error: safeError && safeError.name ? safeError.name : fallbackName,
      message: safeError && typeof safeError.message === "string" ? safeError.message : fallbackMessage,
      ...(safeError && typeof safeError.code === "string" ? { code: safeError.code } : {}),
      ...(safeError && safeError.body && typeof safeError.body === "object" ? { details: safeError.body } : {}),
    },
  };
};
const sendPublicError = (res, error, fallbackName, fallbackMessage) => {
  const response = sanitizePublicErrorResponse(error, fallbackName, fallbackMessage);
  return res.status(response.status).json(response.body);
};
const ORGANIZATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const requireSafeOrganizationIdParam = (req, res, next) => {
  if (!ORGANIZATION_ID_PATTERN.test(req.params.organizationId || "")) {
    return res.status(400).json({ error: "ValidationError", message: "Invalid organization identifier." });
  }
  return next();
};

const buildMeResponse = (user) => {
  const globalRoles = Array.isArray(user?.globalRoles) ? user.globalRoles : [];
  const organizationRoles = Array.isArray(user?.organizationRoles) ? user.organizationRoles : [];
  return {
    auth: {
      sub: user?.sub || user?.id || null,
      organizationId: user?.organizationId || null,
      scopes: user?.scopes || [],
      roles: user?.roles || [],
      globalRoles,
      organizationRoles,
      owner: {
        canReadOwner: globalRoles.includes(OWNER_GLOBAL_ROLE),
        canWriteOwner: globalRoles.includes(OWNER_GLOBAL_ROLE),
      },
    },
  };
};

async function loadOrganizationRuntimeStateSafe(logtoOrganizationId) {
  if (!logtoOrganizationId) return [];
  try { return await listRuntimeState({ logtoOrganizationId }); }
  catch (_error) { return []; }
}

async function loadOwnerConnectorRowsSafe(logtoOrganizationId) {
  if (!logtoOrganizationId) return [];
  const rows = [];
  for (const capability of OWNER_CAPABILITIES) {
    try { rows.push(...await loadConnectorRows({ logtoOrganizationId, capability })); }
    catch (_error) { /* Registry DB may be unavailable during bootstrap; unconfigured capabilities remain explicit. */ }
  }
  return rows;
}

async function buildOwnerProfile(organization) {
  const logtoOrganizationId = getLogtoOrganizationId(organization);
  const runtimeStateRows = await loadOrganizationRuntimeStateSafe(logtoOrganizationId);
  return deriveOperationalProfile(organization, { runtimeStateRows });
}

const serializeOwnerOrganization = async (organization, { operations = [] } = {}) => {
  const profile = await buildOwnerProfile(organization);
  return {
    logtoOrganizationId: getLogtoOrganizationId(organization),
    name: getLogtoOrganizationName(organization),
    logtoOrganization: organization,
    canonicalSource: "logto",
    profile,
    runtimeState: profile.runtimeState,
    bootstrap: buildBootstrapStatus({ logtoOrganization: organization, operations }),
    legacy: profile.legacy,
  };
};

secureRoute.get("/health", "health", async (_req, res) => {
  const [database, redis] = await Promise.all([getDatabaseHealth(), getRedisHealth()]);
  const logto = getLogtoConfigHealth();
  const worker = getWorkerReadiness();
  const statuses = [database.status, redis.status, logto.status, worker.status];
  const status = summarizeStatus(statuses);
  res.status(status === "unhealthy" ? 503 : 200).json({
    status: status === "healthy" ? "ok" : status,
    service: "civitas10-backend",
    services: {
      api: "ok",
      database: database.status === "healthy" ? "ok" : "unhealthy",
      redis: redis.status === "healthy" ? "ok" : "unhealthy",
      logto: logto.status === "healthy" ? "ok" : logto.status,
      worker: worker.status === "healthy" ? "ok" : worker.status,
    },
    details: { database, redis, logto, worker },
    db: database.status === "healthy" ? "connected" : "disconnected",
    redis: redis.status === "healthy" ? "connected" : "disconnected",
  });
});


secureRoute.get("/locations/health", "public", async (_req, res) => {
  try {
    const catalog = await getCatalogHealth();
    return res.json({ catalog });
  } catch (error) {
    return sendPublicError(res, error, "LocationsHealthError", "Failed to load location catalog health");
  }
});

secureRoute.get("/locations/countries", "public", async (_req, res) => {
  try {
    const countries = await listCountries();
    if (countries.length === 0) return res.status(503).json({ ...emptyCatalogPayload("countries"), countries: [] });
    return res.json({ countries });
  } catch (error) {
    return sendPublicError(res, error, "LocationsCountriesError", "Failed to list countries");
  }
});

secureRoute.get("/locations/states", "public", async (req, res) => {
  const countryId = parsePositiveInteger(req.query.countryId);
  if (!countryId) return res.status(400).json({ error: "ValidationError", message: "countryId query parameter is required." });
  try {
    const states = await listStatesByCountry(countryId);
    return res.json({ states });
  } catch (error) {
    return sendPublicError(res, error, "LocationsStatesError", "Failed to list country states");
  }
});

secureRoute.get("/locations/cities", "public", async (req, res) => {
  const countryId = parsePositiveInteger(req.query.countryId);
  const stateId = parsePositiveInteger(req.query.stateId);
  if (!countryId && !stateId) return res.status(400).json({ error: "ValidationError", message: "countryId or stateId query parameter is required." });
  try {
    const cities = await listCities({ countryId, stateId });
    return res.json({ cities });
  } catch (error) {
    return sendPublicError(res, error, "LocationsCitiesError", "Failed to list cities");
  }
});

secureRoute.get("/locations/search", "public", async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < 2) return res.status(400).json({ error: "ValidationError", message: "q must contain at least 2 characters." });
  try {
    return res.json({ results: await searchLocations(q) });
  } catch (error) {
    return sendPublicError(res, error, "LocationsSearchError", "Failed to search locations");
  }
});

// Backward-compatible aliases for the first catalog UI iteration.
secureRoute.get("/locations/countries/:countryId/states", "public", async (req, res) => {
  const countryId = parsePositiveInteger(req.params.countryId);
  if (!countryId) return res.status(400).json({ error: "ValidationError", message: "Invalid country identifier." });
  try { return res.json({ states: await listStatesByCountry(countryId) }); }
  catch (error) { return sendPublicError(res, error, "LocationsStatesError", "Failed to list country states"); }
});

secureRoute.get("/locations/states/:stateId/cities", "public", async (req, res) => {
  const stateId = parsePositiveInteger(req.params.stateId);
  if (!stateId) return res.status(400).json({ error: "ValidationError", message: "Invalid state identifier." });
  try { return res.json({ cities: await listCities({ stateId }) }); }
  catch (error) { return sendPublicError(res, error, "LocationsCitiesError", "Failed to list state cities"); }
});

secureRoute.get("/locations/countries/:countryId/phone-code", "public", async (req, res) => {
  const countryId = parsePositiveInteger(req.params.countryId);
  if (!countryId) return res.status(400).json({ error: "ValidationError", message: "Invalid country identifier." });
  try {
    const country = await getCountryPhoneCode(countryId);
    if (!country) return res.status(404).json({ error: "CountryNotFound", message: "Country was not found." });
    return res.json(country);
  } catch (error) {
    return sendPublicError(res, error, "LocationsPhoneCodeError", "Failed to load country phone code");
  }
});

secureRoute.get("/me", "authenticatedRead", requireAuth(API_RESOURCE), (req, res) => {
  res.json(buildMeResponse(req.user));
});

secureRoute.get("/owner/me", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerProfileRead] }), requireGlobalOwner, (req, res) => {
  const me = buildMeResponse(req.user);
  res.json({
    owner: {
      logtoUserId: me.auth.sub,
      internalUserId: me.auth.sub,
      authorizedBy: "shared_contract_logto_global_role_and_scope",
      requiredScope: OWNER_AUTHZ.ownerProfileRead,
      requiredWriteScope: "owner.profile.write",
      canReadOwner: me.auth.owner.canReadOwner,
      canWriteOwner: me.auth.owner.canWriteOwner,
      globalRoles: me.auth.globalRoles,
      scopes: me.auth.scopes,
    },
  });
});

secureRoute.get("/owner/organization-template", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerOrganizationsRead] }), requireGlobalOwner, async (_req, res) => {
  try {
    const roles = await listLogtoOrganizationRoles();
    return res.json({
      roles: roles.map((role) => ({ id: role.id || role.organizationRoleId || role.roleId, name: role.name || role.nameCache || role.key })).filter((role) => role.id && role.name),
      roleSource: "logto_management_api",
      ready: true,
    });
  } catch (error) {
    return sendPublicError(res, error, "OwnerOrganizationTemplateError", "Failed to load Logto organization template");
  }
});

secureRoute.get("/owner/organizations", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerOrganizationsRead] }), requireGlobalOwner, async (_req, res) => {
  try {
    const organizations = await listLogtoOrganizations();
    const operationalState = await listOperationalState({ limit: 200 }).catch(() => ({ operations: [] }));
    return res.json({ organizations: await Promise.all(organizations.map((organization) => serializeOwnerOrganization(organization, { operations: operationalState.operations }))) });
  } catch (error) {
    return sendPublicError(res, error, "OwnerOrganizationsListError", "Failed to list organizations from Logto");
  }
});

secureRoute.post("/owner/organization-drafts", "ownerSensitiveWrite", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerOrganizationsCreate] }), requireGlobalOwner, async (req, res) => {
  try {
    const actor = { type: OWNER_GLOBAL_ROLE, logtoUserId: req.user?.sub || req.user?.id || null };
    const draft = await saveOrganizationProvisioningDraft({
      idempotencyKey: req.body?.idempotencyKey || createIdempotencyKey(),
      currentStage: req.body?.currentStage || req.body?.stage || "canonical",
      stagePayload: req.body?.stagePayload || {},
      stagePayloads: req.body?.stagePayloads || null,
      consolidatedPayload: req.body?.consolidatedPayload || {},
      actor,
      status: req.body?.status || "draft",
      submitStatus: req.body?.submitStatus || "not_submitted",
    });
    return res.status(201).json({ draft, idempotencyKey: draft.idempotencyKey });
  } catch (error) {
    return sendPublicError(res, error, "OwnerOrganizationDraftError", "Failed to save organization draft");
  }
});

secureRoute.get("/owner/organization-drafts/:idempotencyKey", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerOrganizationsRead] }), requireGlobalOwner, async (req, res) => {
  try {
    const draft = await getOrganizationProvisioningDraft({ idempotencyKey: req.params.idempotencyKey });
    if (!draft) return res.status(404).json({ error: "OrganizationDraftNotFound", message: "Organization provisioning draft not found" });
    return res.json({ draft });
  } catch (error) {
    return sendPublicError(res, error, "OwnerOrganizationDraftLoadError", "Failed to load organization draft");
  }
});

secureRoute.get("/owner/organizations/:organizationId/operational-state", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerProfileRead, OWNER_AUTHZ.ownerRuntimeRead] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  try {
    const logtoOrganization = await getLogtoOrganizationById(req.params.organizationId);
    const profile = await buildOwnerProfile(logtoOrganization);
    const workerHealth = await loadWorkerHealthSnapshot();
    const operationalState = await listOperationalState({ limit: 100 });
    const orgOperations = operationalState.operations.filter((operation) => operation.logtoOrganizationId === req.params.organizationId);
    const baseResponse = buildConsolidatedOperationalResponse({
      organization: buildOperationalOrganization(logtoOrganization, profile),
      logtoOrganization,
      profile,
      pending: orgOperations,
      events: operationalState.auditLogRows.filter((row) => row.logtoOrganizationId === req.params.organizationId),
      workerHealth,
      generatedAt: new Date(),
      compatibility: { repository: "civitas10", mode: "clean_foundation_no_legacy_sync_tables" },
    });
    const runtimeStateRows = await loadOrganizationRuntimeStateSafe(req.params.organizationId);
    const connectorRows = await loadOwnerConnectorRowsSafe(req.params.organizationId);
    const ownerState = buildOwnerOperationalStateResponse({ baseResponse, organization: buildOperationalOrganization(logtoOrganization, profile), connectorRows, runtimeStateRows, profile });
    return res.json({ ...ownerState, bootstrap: buildBootstrapStatus({ logtoOrganization, operations: orgOperations }) });
  } catch (error) {
    return sendPublicError(res, error, "OwnerOperationalStateError", "Failed to build operational state");
  }
});



secureRoute.get("/owner/organizations/:organizationId/governance/identity", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerProfileRead] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  return res.status(501).json({ contractVersion: "2026-07-civitas10-identity-federation-v1", organizationId: req.params.organizationId, surface: "owner", status: "planned", reason: "identity_federation_handlers_policies_and_tests_pending" });
});

secureRoute.get("/o/:organizationId/settings/governance/identity", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsRead] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsRead), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); return res.status(501).json({ contractVersion: "2026-07-civitas10-identity-federation-v1", organizationId: req.params.organizationId, surface: "tenant", status: "planned", reason: "identity_federation_handlers_policies_and_tests_pending" }); }
  catch (error) { return sendPublicError(res, error, "TenantIdentityFederationError", "Failed to load identity federation surface"); }
});

secureRoute.get("/owner/organizations/:organizationId/governance", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerProfileRead] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  try {
    const logtoOrganization = await getLogtoOrganizationById(req.params.organizationId);
    const roles = await listLogtoOrganizationRoles();
    const members = await listLogtoOrganizationUsers({ organizationId: req.params.organizationId }).catch(() => []);
    const memberRolesByUserId = new Map(await Promise.all(members.map(async (user) => [user.id || user.userId || user.logtoUserId, await listLogtoOrganizationUserRoles({ organizationId: req.params.organizationId, userId: user.id || user.userId || user.logtoUserId }).catch(() => [])])));
    return res.json(await buildGovernanceReadModel({ organization: logtoOrganization, organizationId: req.params.organizationId, surface: "owner", roles, members, memberRolesByUserId }));
  } catch (error) {
    return sendPublicError(res, error, "OwnerGovernanceReadModelError", "Failed to build owner governance read model");
  }
});

secureRoute.post("/owner/organizations/:organizationId/access-preview", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerProfileRead] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  try { const result = await previewAccess({ organizationId: req.params.organizationId, surface: "owner", body: { ...(req.body || {}), previewOnly: req.body?.previewOnly === true || req.get("X-Civitas-Preview-Only") === "true" }, actorLogtoUserId: actorId(req), principal: req.user || {} }); return res.json(result); }
  catch (error) { return sendPublicError(res, error, "OwnerGovernanceAccessPreviewError", "Failed to preview owner access"); }
});

secureRoute.get("/owner/organizations/:organizationId/governance/audit", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerProfileRead] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  try { return res.json({ contractVersion: "2026-07-civitas10-governance-operations-v1", ...listGovernanceAuditPage({ organizationId: req.params.organizationId, limit: req.query?.limit, cursor: req.query?.cursor, operation: req.query?.operation, outcome: req.query?.outcome, from: req.query?.from, to: req.query?.to }) }); }
  catch (error) { return sendPublicError(res, error, "OwnerGovernanceAuditError", "Failed to load governance audit events"); }
});

secureRoute.get("/owner/organizations/:organizationId/governance/audit/:eventId", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerProfileRead] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  const detail = getGovernanceAuditEvent({ organizationId: req.params.organizationId, eventId: req.params.eventId });
  return detail ? res.json(detail) : res.status(404).json({ error: "AuditEventNotFound" });
});

secureRoute.post("/owner/organizations/:organizationId/governance/audit/export", "ownerSensitiveWrite", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerRuntimeOperationsExecute] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  try { return res.json(exportGovernanceAuditEvents({ organizationId: req.params.organizationId, actorId: actorId(req), capabilityGranted: true, correlationId: req.get("X-Correlation-Id"), filters: req.body?.filters || {} })); }
  catch (error) { return sendPublicError(res, error, "OwnerGovernanceAuditExportError", "Failed to export governance audit events"); }
});

secureRoute.put("/owner/organizations/:organizationId/governance/entitlement-ceilings", "ownerSensitiveWrite", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerRuntimeOperationsExecute] }), requireGlobalOwner, requireSafeOrganizationIdParam, async (req, res) => {
  try {
    const roles = await listLogtoOrganizationRoles();
    const result = await updateOwnerCeilings({ organizationId: req.params.organizationId, actorLogtoUserId: req.user?.sub || req.user?.id, changes: req.body?.changes || [], expectedPolicyVersion: req.body?.expectedPolicyVersion, roleIdToName: roleMapFromRoles(roles), reason: req.body?.reason || "owner_ceiling_update" });
    return res.json({ contractVersion: "2026-07-civitas10-governance-roles-v1", ...result });
  } catch (error) {
    return sendPublicError(res, error, "OwnerGovernanceCeilingError", "Failed to update owner entitlement ceilings");
  }
});

secureRoute.get("/owner/system/worker-queues", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerWorkerQueuesRead] }), requireGlobalOwner, async (_req, res) => {
  try {
    const organizations = await listLogtoOrganizations().catch(() => []);
    const profiles = await Promise.all(organizations.map(buildOwnerProfile));
    const operationalState = await listOperationalState({ limit: 200 });
    const aggregate = await loadWorkerQueuesObservability({ profiles, operations: operationalState.operations, steps: operationalState.steps, auditLogRows: operationalState.auditLogRows });
    return res.json(aggregate);
  } catch (error) {
    return sendPublicError(res, error, "OwnerWorkerQueuesError", "Failed to load worker and queues observability");
  }
});

secureRoute.get("/owner/system/registry", "ownerRead", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerRuntimeRead] }), requireGlobalOwner, async (_req, res) => {
  try {
    return res.json(await listRegistry());
  } catch (error) {
    return sendPublicError(res, error, "OwnerRegistryError", "Failed to load operational registry");
  }
});

secureRoute.post("/owner/system/operations", "operationalTrigger", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerRuntimeOperationsExecute] }), requireGlobalOwner, async (req, res) => {
  try {
    const operation = await createOperation(req.body || {});
    return res.status(202).json({ operation });
  } catch (error) {
    return sendPublicError(res, error, "OperationalOperationCreateError", "Failed to enqueue operational operation");
  }
});

secureRoute.post(["/owner/organizations", "/organizations"], "ownerSensitiveWrite", requireGlobalAccess({ resource: API_RESOURCE, requiredScopes: [OWNER_AUTHZ.ownerOrganizationsCreate] }), requireGlobalOwner, async (req, res) => {
  let idempotencyKey = req.get?.("idempotency-key") || req.body?.idempotencyKey || createIdempotencyKey();
  try {
    const normalized = normalizeProvisioningInput({ ...(req.body || {}), idempotencyKey });
    if (normalized.errors.length > 0) {
      return res.status(400).json({ error: "ValidationError", message: "Organization provisioning input is invalid", details: normalized.errors, idempotencyKey });
    }
    const actor = { type: OWNER_GLOBAL_ROLE, logtoUserId: req.user?.sub || req.user?.id || null };
    await saveOrganizationProvisioningDraft({ idempotencyKey, currentStage: "review", consolidatedPayload: req.body || {}, actor, status: "submitted", submitStatus: "running", submittedAt: new Date() });
    const recorder = createOrganizationProvisioningRecorder({ actor, idempotencyKey });
    try {
      const result = await runCanonicalOrganizationProvisioning({ input: normalized.value, actor, recorder });
      await saveOrganizationProvisioningDraft({ idempotencyKey, currentStage: "review", consolidatedPayload: req.body || {}, actor, status: "submitted", submitStatus: "completed", logtoOrganizationId: result.organizationId, submittedAt: new Date() });
      return res.status(201).json({
        idempotencyKey,
        status: result.status,
        data: result.organization,
        bootstrap: {
          status: "reconciled",
          firstAdminUserId: result.administrativeContactAssignments[0]?.logtoUserId || null,
          assignedOrganizationRole: result.administrativeContactAssignments[0]?.roleName || null,
          administrativeContactAssignments: result.administrativeContactAssignments,
          jitProvisioning: result.jitProvisioning,
          nextActions: [{ type: "open_logto_resource", label: "Abrir organización en Logto", target: { logtoOrganizationId: result.organizationId } }],
        },
      });
    } catch (error) {
      await saveOrganizationProvisioningDraft({ idempotencyKey, currentStage: "review", consolidatedPayload: req.body || {}, actor, status: "submitted", submitStatus: "failed", lastError: { name: error.name, message: error.message, code: error.code || null }, submittedAt: new Date() });
      throw error;
    }
  } catch (error) {
    const response = sanitizePublicErrorResponse(error, "OrganizationProvisioningError", "Failed to create organization in Logto");
    return res.status(response.status).json({ ...response.body, idempotencyKey });
  }
});


function lmsGroupService() {
  return createLmsGroupLeadershipService({ entitlementRepository, dataScopeRepository, roleIdToName: roleMapFromRoles, auditPort: { async audit(event) { console.info(JSON.stringify({ type: "audit", ...event })); } } });
}
function sendLmsGroupError(res, error) {
  return res.status(error.status || 403).json({ error: "Forbidden", code: error.code || "resource_forbidden", reasonCode: error.code || "resource_forbidden" });
}

const documentListHandler = async (_req, res) => {
  res.json([
    { id: "1", title: "Getting Started Guide", updatedAt: "2024-03-15", updatedBy: "John Doe", preview: "Welcome to Civitas clean foundation..." },
    { id: "2", title: "Operational Contract Notes", updatedAt: "2024-03-14", updatedBy: "Alice Smith", preview: "The owner backbone now prefers operational-state over legacy logs..." },
  ]);
};
const documentCreateHandler = async (_req, res) => { res.json({ data: "Document created" }); };


secureRoute.get("/o/:organizationId/lms/groups", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: ["lms.groups.read"] }), requireOrg, requirePermission("lms.groups.read"), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); return res.json(await lmsGroupService().listGroups({ organizationId: req.params.organizationId, principal: await buildPrincipalForRest(req, { permissionId: "lms.groups.read", surface: "rest" }) })); }
  catch (error) { return sendLmsGroupError(res, error); }
});

secureRoute.get("/o/:organizationId/lms/groups/:groupId", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: ["lms.groups.read"] }), requireOrg, requirePermission("lms.groups.read"), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); return res.json(await lmsGroupService().getGroupDetail({ organizationId: req.params.organizationId, groupId: req.params.groupId, principal: await buildPrincipalForRest(req, { permissionId: "lms.groups.read", surface: "rest" }) })); }
  catch (error) { return sendLmsGroupError(res, error); }
});

secureRoute.get("/o/:organizationId/lms/groups/:groupId/members", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: ["lms.group_members.read"] }), requireOrg, requirePermission("lms.group_members.read"), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); return res.json(await lmsGroupService().listGroupMembers({ organizationId: req.params.organizationId, groupId: req.params.groupId, principal: await buildPrincipalForRest(req, { permissionId: "lms.group_members.read", surface: "rest" }) })); }
  catch (error) { return sendLmsGroupError(res, error); }
});

secureRoute.get("/o/:organizationId/governance", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsRead] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.member), requirePermission(ORG_AUTHZ.documentsRead), async (req, res) => {
  try {
    assertTenantRouteMatchesContext(req);
    const logtoOrganization = await getLogtoOrganizationById(req.params.organizationId);
    const roles = await listLogtoOrganizationRoles();
    const members = await listLogtoOrganizationUsers({ organizationId: req.params.organizationId }).catch(() => []);
    const memberRolesByUserId = new Map(await Promise.all(members.map(async (user) => [user.id || user.userId || user.logtoUserId, await listLogtoOrganizationUserRoles({ organizationId: req.params.organizationId, userId: user.id || user.userId || user.logtoUserId }).catch(() => [])])));
    return res.json(await buildGovernanceReadModel({ organization: logtoOrganization, organizationId: req.params.organizationId, surface: "tenant", roles, members, memberRolesByUserId }));
  } catch (error) {
    return sendPublicError(res, error, "TenantGovernanceReadModelError", "Failed to build tenant governance read model");
  }
});

secureRoute.post("/o/:organizationId/access-preview", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsRead] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.member), requirePermission(ORG_AUTHZ.documentsRead), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); const result = await previewAccess({ organizationId: req.params.organizationId, surface: "tenant", body: { ...(req.body || {}), previewOnly: req.body?.previewOnly === true || req.get("X-Civitas-Preview-Only") === "true" }, actorLogtoUserId: actorId(req), principal: req.user || {} }); return res.json(result); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceAccessPreviewError", "Failed to preview tenant access"); }
});

secureRoute.put("/o/:organizationId/governance/navigation-preferences", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); return res.json(updateNavigationPreferences({ organizationId: req.params.organizationId, preferences: req.body?.preferences || [], actorLogtoUserId: actorId(req), surface: "tenant" })); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceNavigationError", "Failed to update navigation preferences"); }
});

secureRoute.get("/o/:organizationId/governance/audit", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsRead] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.member), requirePermission(ORG_AUTHZ.documentsRead), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); return res.json({ contractVersion: "2026-07-civitas10-governance-operations-v1", ...listGovernanceAuditPage({ organizationId: req.params.organizationId, limit: req.query?.limit, cursor: req.query?.cursor, operation: req.query?.operation, outcome: req.query?.outcome, from: req.query?.from, to: req.query?.to }) }); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceAuditError", "Failed to load governance audit events"); }
});

secureRoute.put("/o/:organizationId/governance/role-activations", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try {
    assertTenantRouteMatchesContext(req);
    const roles = await listLogtoOrganizationRoles();
    const result = await updateTenantActivations({ organizationId: req.params.organizationId, actorLogtoUserId: req.user?.sub || req.user?.id, changes: req.body?.changes || [], expectedPolicyVersion: req.body?.expectedPolicyVersion, roleIdToName: roleMapFromRoles(roles), reason: req.body?.reason || "tenant_activation_update" });
    return res.json({ contractVersion: "2026-07-civitas10-governance-roles-v1", ...result });
  } catch (error) {
    return sendPublicError(res, error, "TenantGovernanceActivationError", "Failed to update tenant role activations");
  }
});

secureRoute.post("/o/:organizationId/governance/member-role-assignments", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try {
    assertTenantRouteMatchesContext(req);
    const roleId = String(req.body?.logtoRoleId || "");
    const userId = String(req.body?.logtoUserId || "");
    if (!roleId || !userId) return res.status(400).json({ error: "ValidationError", message: "logtoUserId and logtoRoleId are required." });
    await assignOrganizationRoleToUser({ organizationId: req.params.organizationId, userId, organizationRoleId: roleId });
    return res.status(202).json({ contractVersion: "2026-07-civitas10-governance-roles-v1", status: "accepted", organizationId: req.params.organizationId, target: { logtoUserId: userId, logtoRoleId: roleId } });
  } catch (error) {
    return sendPublicError(res, error, "TenantGovernanceRoleAssignmentError", "Failed to assign organization role");
  }
});


secureRoute.post("/o/:organizationId/governance/taxonomy/values", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); const value = await createTaxonomyValue({ organizationId: req.params.organizationId, body: req.body || {}, actorLogtoUserId: safeActor(req) }); return res.status(201).json({ contractVersion: "2026-07-civitas10-governance-structure-v1", value }); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceTaxonomyValueError", "Failed to create taxonomy value"); }
});

secureRoute.post("/o/:organizationId/governance/taxonomy/publish", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); const result = await publishTaxonomy({ organizationId: req.params.organizationId, body: req.body || {}, actorLogtoUserId: safeActor(req) }); return res.json({ contractVersion: "2026-07-civitas10-governance-structure-v1", ...result }); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceTaxonomyPublishError", "Failed to publish taxonomy catalog"); }
});

secureRoute.post("/o/:organizationId/governance/units", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); const unit = await createGovernanceUnit({ organizationId: req.params.organizationId, body: req.body || {}, actorLogtoUserId: safeActor(req) }); return res.status(201).json({ contractVersion: "2026-07-civitas10-governance-structure-v1", unit }); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceUnitError", "Failed to create organization unit"); }
});

secureRoute.post("/o/:organizationId/governance/units/:unitId/activate", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); const unit = await activateGovernanceUnit({ organizationId: req.params.organizationId, unitId: req.params.unitId, actorLogtoUserId: safeActor(req) }); return res.json({ contractVersion: "2026-07-civitas10-governance-structure-v1", unit }); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceUnitActivateError", "Failed to activate organization unit"); }
});

secureRoute.post("/o/:organizationId/governance/data-scopes", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), async (req, res) => {
  try { assertTenantRouteMatchesContext(req); const result = await createDataScope({ organizationId: req.params.organizationId, body: req.body || {}, actorLogtoUserId: safeActor(req) }); return res.status(201).json({ contractVersion: "2026-07-civitas10-governance-structure-v1", ...result }); }
  catch (error) { return sendPublicError(res, error, "TenantGovernanceDataScopeError", "Failed to create data-scope assignment"); }
});

const documentReadPolicies = ["same-organization", "membership-required"];
const documentCreatePolicies = ["same-organization", "membership-required", "critical-operation-audited"];

secureRoute.get("/o/:organizationId/documents", "organizationMemberRead", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsRead] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.member), requirePermission(ORG_AUTHZ.documentsRead), requireAuthorization({ permission: ORG_AUTHZ.documentsRead, actionId: "documents.read", surface: "organization", operation: "read", policies: documentReadPolicies }), documentListHandler);

secureRoute.post("/o/:organizationId/documents", "organizationAdminWrite", requireSafeOrganizationIdParam, requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), requireAuthorization({ permission: ORG_AUTHZ.documentsCreate, actionId: "documents.create", surface: "organization", operation: "create", policies: documentCreatePolicies, auditIntentResolver: (req) => ({ decisionId: req.authorizationDecision?.decisionId, action: "documents.create", actorSubject: req.auth?.subject || req.user?.sub || req.user?.id, organizationId: req.params.organizationId, targetType: "document", reason: req.body?.reason || "document_create", reasonRequired: false, idempotencyRequired: false }) }), documentCreateHandler);

registerScimUserRoutes({ secureRoute });

registerIdentityFederationRoutes({
  secureRoute,
  requireSafeOrganizationIdParam,
  requireGlobalAccess,
  requireGlobalOwner,
  requireOrganizationAccess,
  requireOrg,
  requireOrganizationRole,
  requirePermission,
  sharedAuth: SHARED_AUTH,
  apiResource: API_RESOURCE,
});

registerScimReconciliationRoutes({
  secureRoute,
  requireSafeOrganizationIdParam,
  requireGlobalAccess,
  requireGlobalOwner,
  requireOrganizationAccess,
  requireOrg,
  requireOrganizationRole,
  requirePermission,
  sharedAuth: SHARED_AUTH,
  apiResource: API_RESOURCE,
});

secureRoute.get("/documents", "organizationMemberReadLegacyRedirect", requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsRead] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.member), requirePermission(ORG_AUTHZ.documentsRead), (req, res) => {
  const canonicalPath = organizationPath(req.auth?.organizationId || req.user?.organizationId, "documents");
  res.set("Deprecation", "true");
  res.set("Link", `<${canonicalPath}>; rel="canonical"`);
  return res.redirect(308, canonicalPath);
});

secureRoute.post("/documents", "organizationAdminWriteLegacyRejected", requireOrganizationAccess({ requiredAllScopes: [ORG_AUTHZ.documentsCreate] }), requireOrg, requireOrganizationRole(SHARED_AUTH.organization.roles.admin), requirePermission(ORG_AUTHZ.documentsCreate), (req, res) => {
  const canonicalPath = organizationPath(req.auth?.organizationId || req.user?.organizationId, "documents");
  return res.status(410).json({ error: "EndpointDeprecated", code: "tenant_route_deprecated", canonicalPath });
});


secureRoute.get("/", "public", (_req, res) => {
  res.json({ message: "Welcome to the Civitas 10 API" });
});

secureRoute.assertAllRegisteredRoutesHavePolicies();

if (require.main === module) {
  Promise.resolve()
    .then(() => validateRuntimeEnv({ requireRedis: true }))
    .then(() => waitForDatabase({ ping: pingDatabase }))
    .then(() => prepareOperationalDatabase())
    .then(() => ensureLocationCatalog())
    .then(() => app.listen(port, () => { console.log(`Server is running on port ${port}`); }))
    .catch((error) => { console.error(`Backend startup failed: ${error.message}`); process.exit(1); });
}

module.exports = { app, secureRoute, getWorkerHealthSnapshot, deriveOperationalProfile, requireGlobalOwner };
