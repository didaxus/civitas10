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
const segmentation = readFileSync(new URL("./modules/people-segmentation/PeopleSegmentationModule.tsx", import.meta.url), "utf8");
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

test("role names screen matches the product table and user-count navigation contract", () => {
  assert.match(roleNames, /Manage the display names used across Civitas/);
  assert.match(roleNames, /Manage the display names used in this organization/);
  for (const header of ["Role name", "Display name", "Users", "Status", "Actions"]) assert.match(roleNames, new RegExp(`>${header}<`));
  assert.match(roleNames, /Search roles/);
  assert.match(roleNames, /Search by role name or display name/);
  assert.match(roleNames, /directRoleUserCount/);
  assert.match(roleNames, /View .* assigned to .* in Segmentation/);
  assert.match(roleNames, /appRoutes\.ownerOrganizationGovernancePeopleSegmentation\.build/);
  assert.match(roleNames, /appRoutes\.tenantGovernancePeopleSegmentation\.build/);
  assert.match(roleNames, /new URLSearchParams\(\{ role: canonicalRoleKey \}\)/);
  assert.doesNotMatch(roleNames, /Canonical role|Logto role|Civitas default|Uses Civitas default|Inherited|Organization alias|<code|Role mapping needs attention|diagnostics/i);
  assert.doesNotMatch(roleNames, /assignedMemberCount\)|filter\(.*members|roleAliases\.length|permissions\.length/);
  assert.match(contracts, /directRoleUserCount: number/);
});


test("tenant segmentation route and read-only segmentation projection are mounted", () => {
  assert.match(routes, /tenantGovernancePeopleSegmentationRoute = defineRoute\("\/o\/:organizationId\/settings\/governance\/organization-model\/segments"\)/);
  assert.match(routeCatalogSource, /tenantGovernancePeopleSegmentation: route\("tenant\.settings\.governance\.organization_model\.segments"/);
  assert.match(appSource, /appRoutes\.tenantGovernancePeopleSegmentation\.path/);
  assert.match(workspaceContract, /tenantRouteKey: "tenantGovernancePeopleSegmentation"/);
  assert.match(segmentation, /Review the users and authorization cohorts associated with organization roles/);
  assert.match(segmentation, /Direct role users/);
  assert.match(segmentation, /Owner-authorized capabilities/);
  assert.match(segmentation, /Organization-enabled capabilities/);
  assert.match(segmentation, /Scoped users/);
  assert.match(contracts, /Direct role assignment/);
  assert.match(segmentation, /PBAC reduces capability availability; it does not add users to the role/);
  assert.match(segmentation, /ABAC partitions direct role members by registered scopes; it does not add users to the role/);
  assert.doesNotMatch(segmentation, /logtoRoleId|logtoRoleName|permission arrays|policy JSON|canonicalRoleKey}<|<code/);
});
test("role names routes retain stable destinations", () => { assert.match(routes, /access-policy\/role-names/); assert.match(workspaceContract, /Role Names/); });


test("permission workspace uses the backend view model and batch save", () => {
  assert.match(matrix, /PendingChangesBar/);
  assert.match(matrix, /permissions \{countNoun\}/); assert.match(matrix, /authorized/); assert.match(matrix, /enabled/);
  assert.match(matrix, /expectedPolicyVersion/);
  assert.match(matrix, /status===409|status === 409/);
  assert.match(matrix, /beforeunload/);
  assert.doesNotMatch(matrix, /Review & Save|split\(\"\.\"\)|actionNames|resourceNames/);
});

test("permission groups compose shared grid and switches", () => {
  const primitive = readFileSync(new URL("../../shared/ui/PermissionGroupAccordion.tsx", import.meta.url), "utf8");
  assert.match(primitive, /PermissionGrid/); assert.match(primitive, /Switch/); assert.match(primitive, /UnavailableSwitch/);
  assert.match(primitive, /activeCount\} \/ \{totalCount/);
  assert.doesNotMatch(primitive, /checkbox|gridTemplateColumns|Why unavailable|None enabled|Some enabled|All enabled|Enable all permissions/);
});

test("role permissions editor does not reconstruct authorization", () => {
  const adapter = readFileSync(new URL("./modules/permission-matrix/permission-policy-view-model.ts", import.meta.url), "utf8");
  assert.match(adapter, /row\.label/); assert.match(adapter, /row\.description/); assert.match(adapter, /row\.groupLabel/); assert.match(adapter, /row\.canChange/);
  assert.doesNotMatch(adapter, /split\(|reasonCode|permissionId as fallback/);
  assert.match(adapter, /row\.rolePotential/); assert.match(adapter, /row\.ownerAllowed/);
  assert.doesNotMatch(matrix, /reason\.code|permissionId as fallback/);
  assert.match(api, /updateOwnerCeilings/); assert.match(api, /updateTenantActivations/);
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
