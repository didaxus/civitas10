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
  assert.match(routes, /\/settings\/governance/);
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

test("governance sections are route-backed vertical navigation", () => {
  assert.match(routes, /governance\/access-policy\/roles/);
  assert.match(routes, /governance\/organization-model\/structure/);
  assert.match(routes, /governance\/groups/);
  assert.match(routes, /governance\/data-scopes/);
  assert.match(routes, /governance\/access-policy\/role-names/);
  assert.match(routes, /governance\/preview/);
  assert.match(routes, /governance\/audit/);
  assert.doesNotMatch(page, /WorkspaceShell|SectionNavigation|GovernanceSectionNav/);
  assert.match(page, /<section className="min-w-0"/);
  assert.match(workspaceContract, /Access policy/);
  assert.match(workspaceContract, /Organization model/);
  assert.match(workspaceContract, /Control and evidence/);
  assert.match(workspaceContract, /People segmentation/);
  assert.match(page, /OrganizationContextHeader/);
  assert.doesNotMatch(page, /<Tabs|useSearchParams/);
});

test("governance workspace owns overview and operations in the persistent organization shell", () => {
  assert.doesNotMatch(page, /<nav className=\"civitas-card civitas-pad-tight\"/);
  assert.match(workspaceContract, /organization-overview/);
  assert.match(workspaceContract, /label: "Operations"/);
  assert.match(page, /overview and operations share this persistent organization shell/i);
  assert.match(routes, /ownerOrganizationGovernancePeopleSegmentation/);
});

test("governance read model keeps concepts and reason versions separated", () => {
  for (const field of ["canonical", "rolePotential", "ownerAllowed", "tenantEnabled", "effective", "reason"]) {
    assert.match(contracts, new RegExp(field));
    assert.match(matrix, new RegExp(field));
  }
  assert.match(contracts, /type PermissionMatrixReason/);
  assert.match(contracts, /sourceVersions/);
  assert.doesNotMatch(matrix, /formatSourceVersions/);
  assert.match(matrix + reasonFormat, /not_canonical/);
  assert.match(matrix + reasonFormat, /ceiling_not_authorized/);
  assert.match(matrix, /role_permission_missing/);
  assert.match(matrix + reasonFormat, /Not granted to this role/);
  assert.match(contracts, /taxonomyIds/);
  assert.match(contracts, /unitIds/);
  assert.match(dataScope, /DataTable/);
  assert.match(dataScope, /No data-scope assignments/);
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

test("governance modules are feature-owned and responsive-neutral", () => {
  for (const moduleName of ["PermissionMatrixModule", "MembersRoleAssignmentsModule", "UnitsModule", "DataScopeModule", "AliasesNavigationModule", "AccessPreviewModule", "AuditDiagnosticsModule"]) {
    assert.match(page, new RegExp(moduleName));
  }
  assert.doesNotMatch(page, /innerWidth|matchMedia|role ===|roles\.includes/);
  assert.doesNotMatch(page, /OverviewModule/);
});


test("structure workspace represents persisted organization units, not taxonomy graph nodes", () => {
  assert.match(unitsModule, /HierarchyWorkbench/);
  assert.match(unitsModule, /FilterToolbar/);
  assert.match(unitsModule, /FormDrawer/);
  assert.match(unitsModule, /ResponsiveDataView/);
  assert.match(unitsModule, /OrganizationUnit nodes and parent-child edges/);
  assert.match(unitsModule, /Virtual organization root/);
  assert.match(unitsModule, /Descendants are excluded to prevalidate cycles/);
  assert.match(unitsModule, /Taxonomy tags filter and classify units; they never become hierarchy nodes/);
  assert.match(unitsModule, /never edits RBAC, PBAC or ABAC permissions/);
  assert.match(unitsModule, /React Flow is not added until license, bundle and accessibility review is complete/);
  assert.doesNotMatch(unitsModule, /avatar|Persona seleccionada|permission toggle|ownerAllowed|tenantEnabled|ReactFlow|reactflow|fetch\(/i);
  assert.match(page, /<UnitsModule units=\{model\.units\} taxonomy=\{model\.taxonomy\} surface=\{model\.surface\}/);
});

test("structure routes separate owner inspection from tenant organization model workspace", () => {
  assert.match(routes, /ownerOrganizationGovernanceStructureRoute = defineRoute\("\/owner\/organizations\/:organizationId\/governance\/organization-model\/structure"\)/);
  assert.match(routes, /tenantGovernanceStructureRoute = defineRoute\("\/settings\/governance\/organization-model\/structure"\)/);
  assert.match(workspaceContract, /routeKey: "ownerOrganizationGovernanceStructure"/);
  assert.match(routeCatalogSource, /tenantGovernanceStructure: route\("tenant\.settings\.governance\.organization_model\.structure"/);
  assert.match(appSource, /appRoutes\.tenantGovernanceStructure\.path/);
});

test("scope assignments screen is role-path bound and backend-contract driven", () => {
  assert.match(dataScope, /RoleSelector/);
  assert.match(dataScope, /FilterBar/);
  assert.match(dataScope, /DataTable/);
  assert.match(dataScope, /DecisionState/);
  assert.match(dataScope, /membershipId/);
  assert.match(dataScope, /canonicalRoleId/);
  assert.match(dataScope, /scopeTemplateId/);
  assert.match(dataScope, /writeUrlState/);
  assert.match(dataScope, /beforeunload/);
  assert.match(dataScope, /Missing scope fails closed/);
  assert.match(dataScope, /Cross-tenant, stale and template-incompatible targets must be rejected by the backend/);
  assert.match(dataScope, /disabled title="Scope assignment changes are not available yet"/);
  assert.doesNotMatch(dataScope, /ownerAllowed|tenantEnabled|role ===|roles\.includes|evaluate|allow\(|fetch\(/);
  assert.match(contracts, /membershipId\?/);
  assert.match(contracts, /canonicalRoleId\?/);
  assert.match(contracts, /scopeTemplateId\?/);
  assert.match(page, /<DataScopeModule assignments=\{model\.dataScopes\} roles=\{model\.roles \|\| \[\]\}/);
  assert.match(page, /<AliasesNavigationModule roles=\{model\.roles \?\? \[\]\} policy=\{model\.aliasesNavigation\}/);
});

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

test("role names routes separate owner audit context from tenant alias editing", () => {
  assert.match(routes, /ownerOrganizationGovernanceRoleNamesRoute = defineRoute\("\/owner\/organizations\/:organizationId\/governance\/access-policy\/role-names"\)/);
  assert.match(routes, /tenantGovernanceRoleNamesRoute = defineRoute\("\/settings\/governance\/access-policy\/role-names"\)/);
  assert.match(workspaceContract, /routeKey: "ownerOrganizationGovernanceRoleNames"/);
  assert.match(routeCatalogSource, /tenantGovernanceRoleNames: route\("tenant\.settings\.governance\.role_names"/);
  assert.match(appSource, /appRoutes\.tenantGovernanceRoleNames\.path/);
  assert.match(page, /"role-names": "role-names"/);
});


test("permission group UX keeps groups collapsed and search scoped to selected role", () => {
  assert.match(matrix, /expanded=\{expanded\[domain\] \?\? false\}/);
  assert.doesNotMatch(matrix, /grouped\.size <= 3|pendingCount\} pending|setPending\(\{\}\); writeUrlState\(\{ filter/);
  assert.match(matrix, /const roleRows = useMemo\(\(\) => rows\.filter\(\(row\) => row\.roleId === effectiveRoleId\)/);
  assert.match(matrix, /row\.displayName/);
  assert.match(matrix, /row\.description/);
  assert.match(matrix, /toggleGroup\(allItems, enabled\)/);
  assert.match(matrix, /\{pendingCount\} unsaved changes/);
});

test("permission group primitive uses compact independent expansion and toggle controls", () => {
  const primitive = readFileSync(new URL("../../shared/ui/PermissionGroupAccordion.tsx", import.meta.url), "utf8");
  assert.match(primitive, /aria-expanded=\{expanded\}/);
  assert.match(primitive, /aria-controls=\{panelId\}/);
  assert.match(primitive, /groupToggleActive = activeCount > 0/);
  assert.doesNotMatch(primitive, /indeterminate|StatusPill/);
  assert.match(primitive, /Permission name/);
  assert.match(primitive, /Permission\/capability description/);
  assert.match(primitive, /Toggle \{row\.label\} for \{roleLabel\}/);
});

test("role permissions editor is operational, single-role and endpoint-backed", () => {
  assert.match(matrix, /RoleSelector/);
  assert.match(matrix, /PermissionGroupAccordion/);
  assert.match(matrix, /FilterBar/);
  assert.match(matrix, /unsaved changes/);
  assert.match(matrix, /expectedPolicyVersion/);
  assert.match(matrix, /owner_ceiling_update/);
  assert.match(matrix, /tenant_activation_update/);
  assert.match(matrix, /owner_ceiling_denied/);
  assert.match(matrix, /rowEligible/);
  assert.match(matrix, /row\.reason\.code === "owning_operation_not_mounted"/);
  assert.match(matrix, /params\.set\("role"/);
  assert.match(matrix, /params\.set\("filter"/);
  assert.doesNotMatch(matrix, /DataTable|role ===|roles\.includes|fetch\(/);
  assert.match(api, /updateOwnerCeilings/);
  assert.match(api, /governance\/entitlement-ceilings/);
  assert.match(api, /allowed: change\.enabled/);
  assert.match(api, /updateTenantActivations/);
  assert.match(api, /governance\/role-activations/);
  assert.match(api, /enabled: change\.enabled/);
  assert.match(page, /onSaveOwnerCeilings/);
  assert.match(page, /onSaveTenantActivations/);
});

test("role permissions routes distinguish owner ceilings from tenant activations", () => {
  assert.match(routes, /ownerOrganizationGovernanceRolesRoute = defineRoute\("\/owner\/organizations\/:organizationId\/governance\/access-policy\/roles"\)/);
  assert.match(routes, /tenantGovernanceRolesRoute = defineRoute\("\/settings\/governance\/access-policy\/roles"\)/);
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


test("legacy governance root stays in the persistent organization shell", () => {
  assert.doesNotMatch(appSource, /OwnerGovernanceLegacyRedirect/);
  assert.match(routes, /ownerOrganizationOperationsRoute = defineRoute\("\/owner\/organizations\/:organizationId\/operations"\)/);
  const legacyRouteLine = appSource.split("\n").find((line) => line.includes("appRoutes.ownerOrganizationGovernance.path")) || "";
  assert.match(legacyRouteLine, /GovernanceStudioPage surface="owner"/);
});
