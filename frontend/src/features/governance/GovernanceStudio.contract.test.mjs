import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("./GovernanceStudioPage.tsx", import.meta.url), "utf8");
const contracts = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
const api = readFileSync(new URL("./api.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("../../navigation/routes.ts", import.meta.url), "utf8");
const registry = readFileSync(new URL("./visual/governance.screen.ts", import.meta.url), "utf8");
const matrix = readFileSync(new URL("./modules/permission-matrix/PermissionMatrixModule.tsx", import.meta.url), "utf8");
const roleNames = readFileSync(new URL("./modules/aliases-navigation/AliasesNavigationModule.tsx", import.meta.url), "utf8");
const reasonFormat = readFileSync(new URL("./modules/permission-matrix/reason-format.ts", import.meta.url), "utf8");
const dataScope = readFileSync(new URL("./modules/data-scope/DataScopeModule.tsx", import.meta.url), "utf8");
const unitsModule = readFileSync(new URL("./modules/units/UnitsModule.tsx", import.meta.url), "utf8");
const accessPreview = readFileSync(new URL("./modules/access-preview/AccessPreviewModule.tsx", import.meta.url), "utf8");
const routeCatalogSource = readFileSync(new URL("../../navigation/route-catalog.ts", import.meta.url), "utf8");
const workspaceContract = readFileSync(new URL("./governance-workspace-contract.ts", import.meta.url), "utf8");
const appSource = readFileSync(new URL("../../pages/App/index.tsx", import.meta.url), "utf8");
const evaluator = readFileSync(new URL("../../authorization/evaluation/evaluate-screen.ts", import.meta.url), "utf8");

test("governance studio exposes separate owner and tenant surfaces", () => {
  assert.match(routes, /ownerOrganizationGovernance/);
  assert.match(routes, /\/owner\/organizations\/:organizationId\/governance/);
  assert.match(routes, /tenantGovernance/);
  assert.match(routes, /\/o\/:organizationId\/settings\/governance/);
  assert.match(registry, /owner-governance/);
  assert.match(registry, /route: routeCatalog\.ownerOrganizationGovernance/);
  assert.match(registry, /requiresOrganizationContext: false/);
  assert.match(routeCatalogSource, /ownerOrganizationGovernance:[\s\S]*"platform"/);
  assert.match(appSource, /ScreenGate screenId="owner-governance"/);
  assert.doesNotMatch(appSource, /ScreenGate screenId="owner-organization-governance"/);
  assert.match(registry, /tenant-governance/);
  assert.match(routeCatalogSource, /tenantGovernance: route\("tenant\.settings\.governance", appRoutes\.tenantGovernance\.path, "tenant", "tenant"\)/);
});

test("context scopes preserve owner platform access and tenant organization enforcement", () => {
  assert.match(registry, /screenId: "owner-governance"[\s\S]*requiresOrganizationContext: false/);
  assert.match(routeCatalogSource, /const route = \(routeId: string, path: string, scope: RouteReference\["scope"\], contextScope: RouteReference\["contextScope"\]/);
  assert.match(routeCatalogSource, /ownerOrganizationGovernance: route\("owner\.organizations\.governance", appRoutes\.ownerOrganizationGovernance\.path, "owner", "platform"\)/);
  assert.match(registry, /screenId: "tenant-governance"[\s\S]*requiresOrganizationContext: true/);
  assert.match(routeCatalogSource, /tenantGovernance: route\("tenant\.settings\.governance", appRoutes\.tenantGovernance\.path, "tenant", "tenant"\)/);
  assert.match(evaluator, /requiresOrganizationContext && !context\.organizationId/);
});

test("governance sections use the canonical flat route-backed contract", () => {
  assert.match(workspaceContract, /GOVERNANCE_WORKSPACE_ITEMS/);
  for (const label of ["Roles & Permissions", "Role Names", "Data Scopes", "Structure", "Segmentation", "Access Explorer", "Logs"]) assert.match(workspaceContract, new RegExp(label.replace(/[&]/g, "\&")));
  assert.doesNotMatch(workspaceContract, /groups-courses|identity-provisioning|organization-overview|\"operations\"/);
});

test("governance owns content only", () => {
  assert.doesNotMatch(page, /OwnerLayout|OrganizationLayout|OperationalOverview|OperationalModules|OrganizationContextHeader|WorkspaceShell|GovernanceSectionNav/);
});

test("governance read model keeps technical history outside the permission interface", () => {
  assert.match(contracts, /PermissionMatrixReason/);
  assert.match(reasonFormat, /sourceVersions/);
  assert.doesNotMatch(matrix, /reasonLabel|formatSourceVersions|permissionId\} ·|title=\{row\.permission/);
});

test("governance page is an aggregate read model, not a write authority", () => {
  assert.match(api, /ownerApiFetch\(`\/owner\/organizations\/\$\{encodeURIComponent\(organizationId\)\}\/governance`\)/);
  assert.match(api, /access-preview/);
  assert.doesNotMatch(api, /createScope|createRole|lms\.\*|org\.members\.\*/);
  assert.doesNotMatch(page, /no client Logto Management API|Feature writes stay in their owning services|Governance boundary|no wildcards|visual preferences only subtract|backend remains authority|The UI stays read-only and does not fetch/);
});

test("access preview is read-only and does not mutate grants", () => {
  assert.match(accessPreview, /Read-only/);
  assert.match(accessPreview, /Access preview is not available yet/);
  assert.match(accessPreview, /DataTable/);
  assert.match(api, /previewOwnerAccessReadOnly/);
  assert.match(api, /previewTenantAccessReadOnly/);
  assert.match(api, /X-Civitas-Preview-Only/);
  assert.match(api, /previewOnly: true/);
  assert.doesNotMatch(accessPreview, /setModel|tenantEnabled|ownerAllowed|org_role_grants|grantRole|createGrant/);
});

test("governance modules are feature-owned and shell-neutral", () => {
  for (const moduleName of ["PermissionMatrixModule", "UnitsModule", "DataScopeModule", "AliasesNavigationModule", "AccessPreviewModule", "AuditDiagnosticsModule"]) assert.match(page, new RegExp(moduleName));
  assert.doesNotMatch(page, /<aside|<nav|OwnerShell/);
});


test("structure workspace remains route-backed", () => { assert.match(routes, /governance\/organization-model\/structure/); assert.match(workspaceContract, /structure-classification/); });

test("structure routes separate owner inspection from tenant organization model workspace", () => {
  assert.match(routes, /ownerOrganizationGovernanceStructureRoute = defineRoute\("\/owner\/organizations\/:organizationId\/governance\/organization-model\/structure"\)/);
  assert.match(routes, /tenantGovernanceStructureRoute = defineRoute\("\/o\/:organizationId\/settings\/governance\/organization-model\/structure"\)/);
  assert.match(workspaceContract, /routeKey: "ownerOrganizationGovernanceStructure"/);
  assert.match(routeCatalogSource, /tenantGovernanceStructure: route\("tenant\.settings\.governance\.organization_model\.structure"/);
  assert.match(appSource, /appRoutes\.tenantGovernanceStructure\.path/);
});

test("scope assignments remain role-path bound", () => { assert.match(routes, /scope-assignments/); assert.match(workspaceContract, /Data Scopes/); });

test("role names screen is the simple alias editor", () => {
  assert.match(roleNames, /Role names/);
  assert.match(roleNames, /roles= \[\]|roles\?: readonly GovernanceRoleSummary\[\]/);
  assert.match(roleNames, /aliasesByRoleId/);
  assert.match(roleNames, /organizationRoles\.map/);
  assert.match(roleNames, /alias\?\.displayName \?\? role\.displayName/);
  assert.match(roleNames, /Canonical role \(Logto\)/);
  assert.match(roleNames, /Visual alias/);
  assert.match(roleNames, /readOnly/);
  assert.match(roleNames, /Save aliases/);
  assert.match(roleNames, /Alias editing is read-only until the audited alias write API is mounted/);
  assert.doesNotMatch(roleNames, /FilterBar|DataTable|StatusPill|Alias edit preview|Canonical role labels|Search role labels|Role family|Audit only|#125|endpoint/);
  assert.doesNotMatch(roleNames, /visualPreferences|navigationTenantEditable|hidden|\border\b|routeId|authorizationEffect|Todavía no conectado|setMessage/);
  assert.doesNotMatch(roleNames, /role ===|roles\.includes|ownerAllowed|tenantEnabled|fetch\(/);
  assert.match(contracts, /defaultLabel\?/);
  assert.match(contracts, /lastChangedAt\?/);
});

test("role names routes retain stable destinations", () => { assert.match(routes, /access-policy\/role-names/); assert.match(workspaceContract, /Role Names/); });


test("permission workspace uses human-readable counters and pending review", () => {
  assert.match(matrix, /permissions enabled/);
  assert.match(matrix, /pending \{pendingList\.length === 1/);
  assert.match(matrix, /Review & Save/);
  assert.match(matrix, /Review changes/);
  assert.match(matrix, /Discard/);
  assert.match(matrix, /toggleGroup\(allGrouped\.get\(domain\)/);
  assert.doesNotMatch(matrix, /unsaved changes|Owner Ceiling policy|Tenant Activation policy/);
});

test("permission group primitive uses three columns and contextual availability", () => {
  const primitive = readFileSync(new URL("../../shared/ui/PermissionGroupAccordion.tsx", import.meta.url), "utf8");
  assert.match(primitive, /aria-expanded=\{expanded\}/);
  assert.match(primitive, /<span>Permission<\/span><span>Description<\/span><span>Control<\/span>/);
  assert.match(primitive, /Why unavailable\?/);
  assert.match(primitive, /Enable all permissions in this group/);
  assert.match(primitive, /of \{totalCount\} enabled/);
  assert.doesNotMatch(primitive, /Availability<|permissionId\} ·|title=\{row\.permissionId/);
});

test("role permissions editor preserves authorization contracts without exposing them", () => {
  assert.match(matrix, /RoleSelector/);
  assert.match(matrix, /PermissionGroupAccordion/);
  assert.match(matrix, /expectedPolicyVersion/);
  assert.match(matrix, /onSaveOwnerCeilings/);
  assert.match(matrix, /onSaveTenantActivations/);
  assert.match(matrix, /Contact support to make this capability available for your organization/);
  assert.match(api, /updateOwnerCeilings/);
  assert.match(api, /updateTenantActivations/);
  assert.doesNotMatch(matrix, /permission IDs|action IDs|namespace|backend code|canonical role|Owner Ceiling policy|Tenant Activation policy/);
});

test("role permissions routes distinguish owner ceilings from tenant activations", () => {
  assert.match(routes, /ownerOrganizationGovernanceRolesRoute = defineRoute\("\/owner\/organizations\/:organizationId\/governance\/access-policy\/roles"\)/);
  assert.match(routes, /tenantGovernanceRolesRoute = defineRoute\("\/o\/:organizationId\/settings\/governance\/access-policy\/roles"\)/);
  assert.match(routeCatalogSource, /tenantGovernanceRoles: route\("tenant\.settings\.governance\.roles"/);
  assert.match(appSource, /appRoutes\.tenantGovernanceRoles\.path/);
});

test("governance unavailable operations prevent blind fetches", () => {
  const capabilities = readFileSync(new URL("./governance-capabilities.ts", import.meta.url), "utf8");
  assert.match(capabilities, /operation-registry\.generated\.json/);
  const artifact = JSON.parse(readFileSync(new URL("./operation-registry.generated.json", import.meta.url), "utf8"));
  assert.equal(artifact.operations.find((entry) => entry.operationId === "governance.readModel" && entry.surface === "owner").status, "active");
  assert.equal(artifact.operations.find((entry) => entry.operationId === "governance.accessPreview" && entry.surface === "owner").status, "active");
  assert.match(page, /!isGovernanceOperationActive\(surface, "governance.readModel"\)/);
  assert.match(api, /assertAccessPreview/);
});


test("governance read model contract validates real mounted fixture", () => {
  const contract = readFileSync(new URL("./contracts.ts", import.meta.url), "utf8");
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/governance-read-model-owner.json", import.meta.url), "utf8"));
  assert.equal(fixture.contractVersion, "2026-07-civitas10-governance-read-model-v1");
  assert.equal(fixture.modules.permissions.status, "active");
  assert.equal(fixture.modules.taxonomy.status, "active");
  assert.equal(fixture.modules["access-preview"].status, "active");
  assert.ok(Array.isArray(fixture.operationRegistry.operations));
  assert.ok(fixture.taxonomy.length > 0);
  assert.ok(fixture.units.length > 0);
  assert.ok(fixture.dataScopes.length > 0);
  assert.equal(fixture.roles[0].canonicalKey, "organization_admin");
  assert.equal(fixture.members[0].display.startsWith("sub_"), true);
  assert.equal(JSON.stringify(fixture).includes("secret@example.test"), false);
  assert.match(contract, /validateGovernanceReadModel/);
  assert.match(contract, /\$\.modules.\$\{key\}\.status/);
  assert.match(contract, /\$\.operationRegistry\.operations/);
  assert.match(contract, /GovernanceRoleSummary/);
  assert.match(contract, /GovernanceMemberSummary/);
  assert.match(api, /assertGovernanceReadModel/);
});


test("governance root is a canonical nested redirect", () => { assert.match(appSource, /GovernanceIndexRoute/); assert.doesNotMatch(appSource, /LegacyTab|LEGACY_TAB|GovernanceLegacy/); });
