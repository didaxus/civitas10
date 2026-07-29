import type { CapabilityKey, FeatureFlagKey, IconKey, PermissionKey, PolicyKey } from "../contracts/ids";

export const authorizationCatalogHash = "57adc4a7b28cb5ddb79bb7f66257d5d226cf27e174f22a7b0a19628aebf4e76d";
export const roleModelVersion = "2026-07-civitas-phase3-role-bundles-v1";
export const visualRegistryContractVersion = "2026-07-civitas-visual-registry-authz-v1";

type CatalogPermissionSurface = "owner" | "organization";
type CatalogPermissionMetadata = Readonly<{ status: "active"; surface: CatalogPermissionSurface; catalogHash: string }>;

const owner = (status: "active" = "active"): CatalogPermissionMetadata => ({ status, surface: "owner", catalogHash: authorizationCatalogHash });
const organization = (status: "active" = "active"): CatalogPermissionMetadata => ({ status, surface: "organization", catalogHash: authorizationCatalogHash });

export const permissionCatalog = new Map<PermissionKey, CatalogPermissionMetadata>([
  ["owner.organizations.create" as PermissionKey, owner()],
  ["owner.organizations.read" as PermissionKey, owner()],
  ["owner.profile.read" as PermissionKey, owner()],
  ["owner.runtime.operations.execute" as PermissionKey, owner()],
  ["owner.runtime.read" as PermissionKey, owner()],
  ["owner.worker_queues.read" as PermissionKey, owner()],
  ["lms.course_offerings.read" as PermissionKey, organization()],
  ["lms.group_members.read" as PermissionKey, organization()],
  ["lms.groups.read" as PermissionKey, organization()],
  ["org.documents.create" as PermissionKey, organization()],
  ["org.documents.read" as PermissionKey, organization()],
  ["planning.plans.read" as PermissionKey, organization()],
  ["planning.plans.manage" as PermissionKey, organization()],
  ["planning.profile.read" as PermissionKey, organization()],
  ["planning.profile.manage" as PermissionKey, organization()],
]);

export const activePermissions = new Set<PermissionKey>(permissionCatalog.keys());
export const knownPolicies = new Set<PolicyKey>(["same-organization", "membership-required", "authorization-snapshot-current", "resource-belongs-to-organization"].map((item) => item as PolicyKey));
export const knownFeatureFlags = new Set<FeatureFlagKey>(["lms-grades", "lms-groups", "owner-runtime"].map((item) => item as FeatureFlagKey));
export const knownCapabilities = new Set<CapabilityKey>(["lms", "crm", "support", "scheduling", "payments", "email", "storage", "analytics", "notifications", "automation", "community", "owner", "account", "planning"]);
export const knownIcons = new Set<IconKey>(["overview", "governance", "operations", "organizations", "directory", "create", "settings", "profile", "grades", "groups", "planning"]);
