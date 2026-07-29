const { relations, sql } = require("drizzle-orm");
const { pgTable, uuid, varchar, text, integer, numeric, timestamp, jsonb, boolean, uniqueIndex, index } = require("drizzle-orm/pg-core");

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const localUsers = pgTable("local_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoUserId: varchar("logto_user_id", { length: 128 }).notNull().unique(),
  emailSnapshot: varchar("email_snapshot", { length: 255 }),
  displayNameSnapshot: varchar("display_name_snapshot", { length: 255 }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
}, (table) => ({ logtoUserIdx: uniqueIndex("local_users_logto_user_id_idx").on(table.logtoUserId) }));

const operationalTenants = pgTable("operational_tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull().unique(),
  nameSnapshot: varchar("name_snapshot", { length: 255 }),
  operationalStatus: varchar("operational_status", { length: 40 }).notNull().default("active"),
  lastLogtoSyncAt: timestamp("last_logto_sync_at", { withTimezone: true }),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
}, (table) => ({ logtoOrgIdx: uniqueIndex("operational_tenants_logto_org_id_idx").on(table.logtoOrganizationId) }));

const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }),
  actorLogtoUserId: varchar("actor_logto_user_id", { length: 128 }),
  actorType: varchar("actor_type", { length: 40 }).notNull().default("system"),
  action: varchar("action", { length: 120 }).notNull(),
  targetType: varchar("target_type", { length: 80 }),
  targetId: varchar("target_id", { length: 160 }),
  result: varchar("result", { length: 40 }).notNull().default("success"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ip: varchar("ip", { length: 80 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({ orgIdx: index("audit_logs_logto_org_idx").on(table.logtoOrganizationId), actionIdx: index("audit_logs_action_idx").on(table.action), actorIdx: index("audit_logs_actor_idx").on(table.actorLogtoUserId) }));

const operationalOperations = pgTable("operational_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }),
  operationType: varchar("operation_type", { length: 120 }).notNull(),
  entityType: varchar("entity_type", { length: 80 }).notNull().default("operational_task"),
  entityId: varchar("entity_id", { length: 160 }),
  status: varchar("status", { length: 40 }).notNull().default("pending"),
  priority: integer("priority").notNull().default(0),
  inputJson: jsonb("input_json").notNull().default(sql`'{}'::jsonb`),
  outputJson: jsonb("output_json").notNull().default(sql`'{}'::jsonb`),
  lastErrorJson: jsonb("last_error_json"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  claimedBy: varchar("claimed_by", { length: 160 }),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  queueName: varchar("queue_name", { length: 120 }),
  jobId: varchar("job_id", { length: 160 }),
  idempotencyKey: varchar("idempotency_key", { length: 200 }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({ statusIdx: index("operational_operations_status_idx").on(table.status, table.nextRetryAt), orgIdx: index("operational_operations_logto_org_idx").on(table.logtoOrganizationId), idemIdx: uniqueIndex("operational_operations_idempotency_idx").on(table.idempotencyKey) }));

const operationalOperationSteps = pgTable("operational_operation_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  operationId: uuid("operation_id").notNull().references(() => operationalOperations.id, { onDelete: "cascade" }),
  stepName: varchar("step_name", { length: 120 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("queued"),
  queueName: varchar("queue_name", { length: 120 }),
  jobId: varchar("job_id", { length: 160 }),
  inputJson: jsonb("input_json").notNull().default(sql`'{}'::jsonb`),
  outputJson: jsonb("output_json").notNull().default(sql`'{}'::jsonb`),
  lastErrorJson: jsonb("last_error_json"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({ opIdx: index("operational_steps_operation_idx").on(table.operationId), statusIdx: index("operational_steps_status_idx").on(table.status) }));


const organizationRuntimeState = pgTable("organization_runtime_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(),
  capability: varchar("capability", { length: 80 }).notNull(),
  stateKey: varchar("state_key", { length: 160 }).notNull(),
  stateValue: text("state_value"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  source: varchar("source", { length: 80 }).notNull().default("organization_runtime_state"),
  status: varchar("status", { length: 40 }).notNull().default("active"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: jsonb("last_error"),
  ...timestamps,
}, (table) => ({
  uniqueOrgCapabilityStateKey: uniqueIndex("organization_runtime_state_org_cap_key_uidx").on(table.logtoOrganizationId, table.capability, table.stateKey),
  orgIdx: index("organization_runtime_state_org_idx").on(table.logtoOrganizationId),
  capabilityIdx: index("organization_runtime_state_capability_idx").on(table.capability),
  orgCapabilityIdx: index("organization_runtime_state_org_capability_idx").on(table.logtoOrganizationId, table.capability),
}));

const capabilities = pgTable("registry_capabilities", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: varchar("key", { length: 80 }).notNull().unique(),
  status: varchar("status", { length: 40 }).notNull().default("active"),
  description: text("description"),
  contract: jsonb("contract").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
});

const adapters = pgTable("registry_adapters", {
  id: uuid("id").primaryKey().defaultRandom(),
  capabilityId: uuid("capability_id").notNull().references(() => capabilities.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 100 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("available"),
  moduleRef: varchar("module_ref", { length: 255 }),
  operationalConfigSchema: jsonb("operational_config_schema").notNull().default(sql`'{}'::jsonb`),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
}, (table) => ({ uniqueCapabilityAdapter: uniqueIndex("registry_adapters_capability_key_idx").on(table.capabilityId, table.key) }));

const connectors = pgTable("registry_connectors", {
  id: uuid("id").primaryKey().defaultRandom(),
  adapterId: uuid("adapter_id").notNull().references(() => adapters.id, { onDelete: "cascade" }),
  key: varchar("key", { length: 120 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("configured"),
  config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
  secretsRef: varchar("secrets_ref", { length: 255 }),
  lastPingAt: timestamp("last_ping_at", { withTimezone: true }),
  lastErrorJson: jsonb("last_error_json"),
  ...timestamps,
}, (table) => ({ uniqueAdapterConnector: uniqueIndex("registry_connectors_adapter_key_idx").on(table.adapterId, table.key) }));

// Connector persistence model (capability-first):
// - registry_capabilities: global catalog of supported external capabilities/contracts.
// - registry_adapters: global catalog of available adapter implementations per capability.
// - registry_connectors: configured connector instances with non-sensitive operational config and secretsRef only.
// - registry_connector_bindings: tenant-scoped active binding from Logto organization + capability to one connector.
const connectorBindings = pgTable("registry_connector_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectorId: uuid("connector_id").notNull().references(() => connectors.id, { onDelete: "cascade" }),
  capabilityId: uuid("capability_id").notNull().references(() => capabilities.id, { onDelete: "cascade" }),
  scopeType: varchar("scope_type", { length: 40 }).notNull().default("tenant"),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }),
  status: varchar("status", { length: 40 }).notNull().default("active"),
  isActive: boolean("is_active").notNull().default(true),
  routingConfig: jsonb("routing_config").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
}, (table) => ({
  scopeIdx: index("registry_bindings_scope_idx").on(table.scopeType, table.logtoOrganizationId),
  activeIdx: index("registry_bindings_active_idx").on(table.isActive, table.status),
  activeOrgCapabilityUnique: uniqueIndex("registry_bindings_active_org_capability_uidx").on(table.logtoOrganizationId, table.capabilityId).where(sql`${table.isActive} = true and ${table.status} = 'active'`),
}));


const capabilityRoleMappings = pgTable("capability_role_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }),
  capability: varchar("capability", { length: 80 }).notNull(),
  connectorKey: varchar("connector_key", { length: 120 }),
  canonicalRoleId: varchar("canonical_role_id", { length: 128 }),
  canonicalRoleName: varchar("canonical_role_name", { length: 160 }).notNull(),
  downstreamRoleKey: varchar("downstream_role_key", { length: 160 }),
  downstreamRoleName: varchar("downstream_role_name", { length: 160 }).notNull(),
  downstreamRoleSlug: varchar("downstream_role_slug", { length: 160 }),
  downstreamPermissions: jsonb("downstream_permissions").notNull().default(sql`'[]'::jsonb`),
  downstreamEntitlements: jsonb("downstream_entitlements").notNull().default(sql`'[]'::jsonb`),
  membershipConstraints: jsonb("membership_constraints").notNull().default(sql`'{}'::jsonb`),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (table) => ({ lookupIdx: index("capability_role_mappings_lookup_idx").on(table.logtoOrganizationId, table.capability, table.connectorKey, table.canonicalRoleName), activeIdx: index("capability_role_mappings_active_idx").on(table.isActive) }));


const organizationProvisioningDrafts = pgTable("organization_provisioning_drafts", {
  idempotencyKey: varchar("idempotency_key", { length: 220 }).primaryKey(),
  currentStage: varchar("current_stage", { length: 40 }).notNull().default("canonical"),
  stagePayloads: jsonb("stage_payloads").notNull().default(sql`'{}'::jsonb`),
  consolidatedPayload: jsonb("consolidated_payload").notNull().default(sql`'{}'::jsonb`),
  actorJson: jsonb("actor_json").notNull().default(sql`'{}'::jsonb`),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  submitStatus: varchar("submit_status", { length: 40 }).notNull().default("not_submitted"),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }),
  lastErrorJson: jsonb("last_error_json"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  statusIdx: index("organization_provisioning_drafts_status_idx").on(table.status, table.submitStatus),
  logtoOrgIdx: index("organization_provisioning_drafts_logto_org_idx").on(table.logtoOrganizationId),
}));

const locationImportRuns = pgTable("location_import_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceName: varchar("source_name", { length: 120 }).notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceVersion: varchar("source_version", { length: 120 }).notNull(),
  license: varchar("license", { length: 120 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 40 }).notNull().default("running"),
  countriesCount: integer("countries_count").notNull().default(0),
  statesCount: integer("states_count").notNull().default(0),
  citiesCount: integer("cities_count").notNull().default(0),
  errorJson: jsonb("error_json"),
}, (table) => ({ statusIdx: index("location_import_runs_status_idx").on(table.status, table.startedAt) }));

const locationCountries = pgTable("location_countries", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  sourceId: integer("source_id").notNull(),
  sourceVersion: varchar("source_version", { length: 120 }).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  iso2: varchar("iso2", { length: 2 }).notNull(),
  iso3: varchar("iso3", { length: 3 }),
  numericCode: varchar("numeric_code", { length: 8 }),
  phoneCode: varchar("phone_code", { length: 32 }),
  capital: varchar("capital", { length: 160 }),
  currency: varchar("currency", { length: 16 }),
  native: varchar("native", { length: 160 }),
  emoji: varchar("emoji", { length: 16 }),
  region: varchar("region", { length: 120 }),
  subregion: varchar("subregion", { length: 120 }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (table) => ({
  sourceIdx: uniqueIndex("location_countries_source_uidx").on(table.sourceId),
  iso2Idx: uniqueIndex("location_countries_iso2_uidx").on(table.iso2),
  nameIdx: index("location_countries_name_idx").on(table.name),
  activeNameIdx: index("location_countries_active_name_idx").on(table.isActive, table.name),
}));

const locationStates = pgTable("location_states", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  sourceId: integer("source_id").notNull(),
  sourceVersion: varchar("source_version", { length: 120 }).notNull(),
  countryId: integer("country_id").notNull().references(() => locationCountries.id, { onDelete: "cascade" }),
  countrySourceId: integer("country_source_id").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  stateCode: varchar("state_code", { length: 32 }),
  type: varchar("type", { length: 80 }),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (table) => ({
  sourceIdx: uniqueIndex("location_states_source_uidx").on(table.sourceId),
  countryIdx: index("location_states_country_idx").on(table.countryId, table.isActive, table.name),
  nameIdx: index("location_states_name_idx").on(table.name),
}));

const locationCities = pgTable("location_cities", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  sourceId: integer("source_id").notNull(),
  sourceVersion: varchar("source_version", { length: 120 }).notNull(),
  countryId: integer("country_id").notNull().references(() => locationCountries.id, { onDelete: "cascade" }),
  stateId: integer("state_id").references(() => locationStates.id, { onDelete: "cascade" }),
  countrySourceId: integer("country_source_id").notNull(),
  stateSourceId: integer("state_source_id"),
  name: varchar("name", { length: 180 }).notNull(),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
}, (table) => ({
  sourceIdx: uniqueIndex("location_cities_source_uidx").on(table.sourceId),
  countryIdx: index("location_cities_country_idx").on(table.countryId, table.isActive, table.name),
  stateIdx: index("location_cities_state_idx").on(table.stateId, table.isActive, table.name),
  nameIdx: index("location_cities_name_idx").on(table.name),
}));


const moduleCatalog = pgTable("module_catalog", {
  moduleId: varchar("module_id", { length: 80 }).primaryKey(),
  kind: varchar("kind", { length: 40 }).notNull(),
  businessOwner: varchar("business_owner", { length: 160 }).notNull(),
  catalogStatus: varchar("catalog_status", { length: 40 }).notNull(),
  catalogVersion: varchar("catalog_version", { length: 40 }).notNull(),
  catalogHash: varchar("catalog_hash", { length: 64 }).notNull(),
  provenance: jsonb("provenance").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
});

const moduleVersions = pgTable("module_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleId: varchar("module_id", { length: 80 }).notNull().references(() => moduleCatalog.moduleId),
  semanticVersion: varchar("semantic_version", { length: 40 }).notNull(),
  manifestSchemaVersion: varchar("manifest_schema_version", { length: 80 }).notNull(),
  manifestHash: varchar("manifest_hash", { length: 64 }).notNull(),
  deploymentMode: varchar("deployment_mode", { length: 40 }).notNull(),
  contractStatus: varchar("contract_status", { length: 40 }).notNull(),
  dataOwnership: jsonb("data_ownership").notNull().default(sql`'{}'::jsonb`),
  contractRefs: jsonb("contract_refs").notNull().default(sql`'{}'::jsonb`),
  compatibilityPolicy: varchar("compatibility_policy", { length: 160 }).notNull(),
  manifestSnapshot: jsonb("manifest_snapshot").notNull(),
  provenance: jsonb("provenance").notNull().default(sql`'{}'::jsonb`),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => ({ moduleVersionUidx: uniqueIndex("module_versions_module_semver_uidx").on(table.moduleId, table.semanticVersion), moduleHashUidx: uniqueIndex("module_versions_module_hash_uidx").on(table.moduleId, table.manifestHash) }));

const organizationModules = pgTable("organization_modules", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(),
  moduleId: varchar("module_id", { length: 80 }).notNull().references(() => moduleCatalog.moduleId),
  moduleVersionId: uuid("module_version_id").notNull().references(() => moduleVersions.id),
  lifecycle: varchar("lifecycle", { length: 40 }).notNull().default("disabled"),
  version: integer("version").notNull().default(1),
  actorLogtoUserId: varchar("actor_logto_user_id", { length: 128 }).notNull(),
  reason: text("reason").notNull(),
  correlationId: varchar("correlation_id", { length: 160 }),
  operationalProvenance: jsonb("operational_provenance").notNull().default(sql`'{}'::jsonb`),
  installedAt: timestamp("installed_at", { withTimezone: true }),
  lifecycleUpdatedAt: timestamp("lifecycle_updated_at", { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => ({ orgModuleUidx: uniqueIndex("organization_modules_org_module_uidx").on(table.logtoOrganizationId, table.moduleId), orgModuleIdx: index("organization_modules_org_idx").on(table.logtoOrganizationId, table.moduleId, table.lifecycle) }));

const moduleRuntimeCatalog = pgTable("module_runtime_catalog", {
  id: uuid("id").primaryKey().defaultRandom(),
  runtimeId: varchar("runtime_id", { length: 120 }).notNull().unique(),
  moduleId: varchar("module_id", { length: 80 }).notNull().references(() => moduleCatalog.moduleId),
  moduleOwner: varchar("module_owner", { length: 160 }).notNull(),
  deploymentMode: varchar("deployment_mode", { length: 40 }).notNull(),
  serviceRef: text("service_ref"),
  runtimeContractVersion: varchar("runtime_contract_version", { length: 120 }).notNull(),
  expectedAudience: varchar("expected_audience", { length: 160 }),
  serviceIdentityRequired: boolean("service_identity_required").notNull().default(false),
  healthPolicy: jsonb("health_policy").notNull().default(sql`'{}'::jsonb`),
  secretsRef: varchar("secrets_ref", { length: 255 }),
  compatibilityMetadata: jsonb("compatibility_metadata").notNull().default(sql`'{}'::jsonb`),
  runtimeStatus: varchar("runtime_status", { length: 40 }).notNull().default("planned"),
  provenance: jsonb("provenance").notNull().default(sql`'{}'::jsonb`),
  version: integer("version").notNull().default(1),
  ...timestamps,
}, (table) => ({ runtimeModuleIdx: index("module_runtime_catalog_module_idx").on(table.moduleId, table.runtimeStatus) }));

const moduleContractCompatibility = pgTable("module_contract_compatibility", {
  id: uuid("id").primaryKey().defaultRandom(),
  moduleVersionId: uuid("module_version_id").notNull().references(() => moduleVersions.id),
  runtimeId: uuid("runtime_id").notNull().references(() => moduleRuntimeCatalog.id),
  hostContractVersion: varchar("host_contract_version", { length: 120 }).notNull(),
  runtimeContractVersion: varchar("runtime_contract_version", { length: 120 }).notNull(),
  uiContractVersion: varchar("ui_contract_version", { length: 120 }),
  compatibilityStatus: varchar("compatibility_status", { length: 40 }).notNull(),
  compatibilityRange: varchar("compatibility_range", { length: 120 }).notNull(),
  policy: varchar("policy", { length: 160 }).notNull(),
  evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
  provenance: jsonb("provenance").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
});

const organizationModuleRuntimeBindings = pgTable("organization_module_runtime_bindings", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(),
  organizationModuleId: uuid("organization_module_id").notNull().references(() => organizationModules.id),
  runtimeId: uuid("runtime_id").notNull().references(() => moduleRuntimeCatalog.id),
  moduleId: varchar("module_id", { length: 80 }).notNull().references(() => moduleCatalog.moduleId),
  selectedContractVersion: varchar("selected_contract_version", { length: 120 }).notNull(),
  expectedContractVersion: varchar("expected_contract_version", { length: 120 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("planned"),
  isExecutable: boolean("is_executable").notNull().default(false),
  version: integer("version").notNull().default(1),
  actorLogtoUserId: varchar("actor_logto_user_id", { length: 128 }).notNull(),
  reason: text("reason").notNull(),
  correlationId: varchar("correlation_id", { length: 160 }),
  operationalConfig: jsonb("operational_config").notNull().default(sql`'{}'::jsonb`),
  provenance: jsonb("provenance").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
}, (table) => ({ orgModuleRuntimeIdx: index("organization_module_runtime_org_idx").on(table.logtoOrganizationId, table.moduleId, table.status) }));

const idempotencyRecords = pgTable("idempotency_records", {
  idempotencyKey: varchar("idempotency_key", { length: 220 }).primaryKey(),
  operationId: uuid("operation_id"),
  actionType: varchar("action_type", { length: 120 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("completed"),
  resultJson: jsonb("result_json").notNull().default(sql`'{}'::jsonb`),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const { roleDelegationRules, orgDelegationRestrictions } = require("./authz-delegation");
const { orgRoleEntitlementLimits, orgRolePermissionActivations, authorizationPolicyVersions } = require("./authz-entitlements");
const taxonomySchema = require("./authz-taxonomy");
const unitsSchema = require("./authz-units");
const dataScopeSchema = require("./authz-data-scopes");
const authorizationRuntimeSchema = require("./authorization-runtime");
const identityFederationSchema = require("./identity-federation");
const organizationScimSchema = require("./organization-scim");
const governanceAuditSchema = require("./governance-audit");

module.exports = { moduleCatalog, moduleVersions, organizationModules, moduleRuntimeCatalog, organizationModuleRuntimeBindings, moduleContractCompatibility, locationImportRuns, locationCountries, locationStates, locationCities, localUsers, operationalTenants, auditLogs, operationalOperations, operationalOperationSteps, organizationProvisioningDrafts, organizationRuntimeState, capabilities, adapters, connectors, connectorBindings, capabilityRoleMappings, idempotencyRecords, roleDelegationRules, orgDelegationRestrictions, orgRoleEntitlementLimits, orgRolePermissionActivations, authorizationPolicyVersions, ...taxonomySchema, ...unitsSchema, ...dataScopeSchema, ...authorizationRuntimeSchema, ...identityFederationSchema, ...organizationScimSchema, ...governanceAuditSchema };
