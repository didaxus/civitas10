const { sql } = require("drizzle-orm");
const { pgTable, uuid, varchar, text, bigint, timestamp, uniqueIndex, index, jsonb } = require("drizzle-orm/pg-core");

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

const organizationIdentityConnections = pgTable("organization_identity_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(),
  logtoSsoConnectorId: varchar("logto_sso_connector_id", { length: 128 }),
  protocol: varchar("protocol", { length: 16 }).notNull(),
  providerKind: varchar("provider_kind", { length: 80 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  issuerOrEntityId: text("issuer_or_entity_id").notNull(),
  subjectStrategy: varchar("subject_strategy", { length: 80 }).notNull(),
  groupMembershipMode: varchar("group_membership_mode", { length: 40 }).notNull(),
  claimContractVersion: bigint("claim_contract_version", { mode: "number" }).notNull().default(1),
  mappingVersion: bigint("mapping_version", { mode: "number" }).notNull().default(1),
  provisioningPolicyVersion: bigint("provisioning_policy_version", { mode: "number" }).notNull().default(1),
  configurationFingerprint: varchar("configuration_fingerprint", { length: 128 }).notNull(),
  secretReference: varchar("secret_reference", { length: 255 }),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  lastSuccessfulLoginAt: timestamp("last_successful_login_at", { withTimezone: true }),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  createdByLogtoUserId: varchar("created_by_logto_user_id", { length: 128 }).notNull(),
  updatedByLogtoUserId: varchar("updated_by_logto_user_id", { length: 128 }).notNull(),
  ...timestamps,
}, (table) => ({
  orgIdUidx: uniqueIndex("organization_identity_connections_org_id_uidx").on(table.logtoOrganizationId, table.id),
  orgStatusIdx: index("organization_identity_connections_org_status_idx").on(table.logtoOrganizationId, table.status),
  connectorIdx: index("organization_identity_connections_connector_idx").on(table.logtoSsoConnectorId),
}));

const organizationExternalRoleMappings = pgTable("organization_external_role_mappings", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(),
  connectionId: uuid("connection_id").notNull().references(() => organizationIdentityConnections.id, { onDelete: "cascade" }),
  externalGroupId: varchar("external_group_id", { length: 255 }).notNull(),
  logtoRoleId: varchar("logto_role_id", { length: 128 }).notNull(),
  canonicalRoleKey: varchar("canonical_role_key", { length: 160 }).notNull(),
  mode: varchar("mode", { length: 40 }).notNull().default("additive"),
  approvalPolicy: varchar("approval_policy", { length: 80 }).notNull().default("tenant_admin_approved"),
  status: varchar("status", { length: 40 }).notNull().default("draft"),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  createdByLogtoUserId: varchar("created_by_logto_user_id", { length: 128 }).notNull(),
  updatedByLogtoUserId: varchar("updated_by_logto_user_id", { length: 128 }).notNull(),
  ...timestamps,
}, (table) => ({
  groupRoleUidx: uniqueIndex("organization_external_role_mappings_group_role_uidx").on(table.connectionId, table.externalGroupId, table.logtoRoleId),
  orgStatusIdx: index("organization_external_role_mappings_org_status_idx").on(table.logtoOrganizationId, table.status),
  connectionIdx: index("organization_external_role_mappings_connection_idx").on(table.connectionId),
  roleIdx: index("organization_external_role_mappings_role_idx").on(table.logtoOrganizationId, table.canonicalRoleKey),
}));

const organizationFederatedAssignmentSources = pgTable("organization_federated_assignment_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }).notNull(),
  logtoUserId: varchar("logto_user_id", { length: 128 }).notNull(),
  assignmentKind: varchar("assignment_kind", { length: 40 }).notNull(),
  assignmentKey: varchar("assignment_key", { length: 255 }).notNull(),
  sourceKind: varchar("source_kind", { length: 80 }).notNull(),
  sourceConnectionId: uuid("source_connection_id").references(() => organizationIdentityConnections.id, { onDelete: "cascade" }),
  sourceExternalGroupId: varchar("source_external_group_id", { length: 255 }),
  mappingId: uuid("mapping_id").references(() => organizationExternalRoleMappings.id, { onDelete: "set null" }),
  mappingVersion: bigint("mapping_version", { mode: "number" }).notNull(),
  state: varchar("state", { length: 40 }).notNull().default("active"),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  ...timestamps,
}, (table) => ({
  activeUidx: uniqueIndex("organization_federated_assignment_sources_active_uidx").on(table.logtoOrganizationId, table.logtoUserId, table.assignmentKind, table.assignmentKey, table.sourceKind, sql`coalesce(${table.sourceConnectionId}, '00000000-0000-0000-0000-000000000000'::uuid)`, sql`coalesce(${table.sourceExternalGroupId}, '')`, sql`coalesce(${table.mappingId}, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`${table.state} in ('active','pending')`),
  userIdx: index("organization_federated_assignment_sources_user_idx").on(table.logtoOrganizationId, table.logtoUserId, table.state),
  mappingIdx: index("organization_federated_assignment_sources_mapping_idx").on(table.mappingId, table.mappingVersion),
}));

const organizationExternalDirectoryObjects = pgTable("organization_external_directory_objects", {
  id: varchar("id", { length: 64 }).primaryKey(),
  logtoOrganizationId: varchar("logto_organization_id", { length: 128 }),
  connectionId: uuid("connection_id").notNull().references(() => organizationIdentityConnections.id, { onDelete: "cascade" }),
  objectType: varchar("object_type", { length: 40 }).notNull(),
  externalId: varchar("external_id", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  sourceKind: varchar("source_kind", { length: 80 }).notNull().default("directory_sync_scim"),
  state: varchar("state", { length: 40 }).notNull().default("active"),
  members: jsonb("members").notNull().default(sql`'[]'::jsonb`),
  canonicalRoleId: varchar("canonical_role_id", { length: 128 }),
  version: bigint("version", { mode: "number" }).notNull().default(1),
  ...timestamps,
}, (table) => ({
  externalUidx: uniqueIndex("organization_external_directory_objects_external_uidx").on(table.connectionId, table.objectType, table.externalId),
  connectionIdx: index("organization_external_directory_objects_connection_idx").on(table.connectionId, table.objectType, table.state),
}));

module.exports = {
  organizationIdentityConnections,
  organizationExternalRoleMappings,
  organizationFederatedAssignmentSources,
  organizationExternalDirectoryObjects,
};
