import { MODULE_UI_CONTRACT_VERSION, MODULE_UI_DESIGN_SYSTEM_VERSION, MODULE_UI_HOST_API_VERSION, type ModuleUiActionContribution, type ModuleUiContribution } from "../../module-ui/loader/contracts";
import { organizationScopedRouteTemplate } from "../../navigation/route-builders";

const catalogHash = "c".repeat(64);
const manifestHash = "d".repeat(64);
const base = organizationScopedRouteTemplate("/planning/plans");
const route = (suffix: string) => `${base}${suffix}`;

export const planningRemoteUiContribution: ModuleUiContribution = {
  contract: { schemaVersion: MODULE_UI_CONTRACT_VERSION, uiContractVersion: MODULE_UI_CONTRACT_VERSION, contributionVersion: "1.0.0", status: "planned" },
  identity: { moduleId: "planning", moduleVersion: "0.1.0", catalogHash, manifestHash },
  artifact: { entrypoint: { artifactId: "planning-remote-ui.js", contentType: "text/javascript; charset=utf-8", sizeBytes: 4096 }, integrity: "sha256-planningRemoteUiImplementationStable", assetManifest: { manifestVersion: "civitas-module-ui-assets/v1", integrity: "sha256-planningRemoteUiAssetGraphStable", assets: [{ artifactId: "planning-remote-ui.js", integrity: "sha256-planningRemoteUiImplementationStable", contentType: "text/javascript; charset=utf-8", sizeBytes: 4096 }] } },
  compatibility: { designSystemVersion: MODULE_UI_DESIGN_SYSTEM_VERSION, hostApiVersion: MODULE_UI_HOST_API_VERSION },
  routes: [
    { routeId: "planning.home", moduleId: "planning", capabilityId: "planning.plans", pathTemplate: base, organizationScope: "required", screenId: "planning.home", status: "planned", permission: "planning.plans.read", breadcrumb: { labelKey: "planning.breadcrumb.home" } },
    { routeId: "planning.plans.list", moduleId: "planning", capabilityId: "planning.plans", pathTemplate: route("/list"), organizationScope: "required", screenId: "planning.plans.list", status: "planned", permission: "planning.plans.read", breadcrumb: { labelKey: "planning.breadcrumb.list", parentRouteId: "planning.home" } },
    { routeId: "planning.plans.create", moduleId: "planning", capabilityId: "planning.plans", pathTemplate: route("/create"), organizationScope: "required", screenId: "planning.plans.create", status: "planned", permission: "planning.plans.manage", breadcrumb: { labelKey: "planning.breadcrumb.create", parentRouteId: "planning.plans.list" } },
    { routeId: "planning.plans.detail", moduleId: "planning", capabilityId: "planning.plans", pathTemplate: route("/:planId"), organizationScope: "required", screenId: "planning.plans.detail", status: "planned", permission: "planning.plans.read", breadcrumb: { labelKey: "planning.breadcrumb.detail", parentRouteId: "planning.plans.list" } },
    { routeId: "planning.plans.edit", moduleId: "planning", capabilityId: "planning.plans", pathTemplate: route("/:planId/edit"), organizationScope: "required", screenId: "planning.plans.edit", status: "planned", permission: "planning.plans.manage", breadcrumb: { labelKey: "planning.breadcrumb.edit", parentRouteId: "planning.plans.detail" } },
    { routeId: "planning.profile", moduleId: "planning", capabilityId: "planning.profile", pathTemplate: route("/profile"), organizationScope: "required", screenId: "planning.profile", status: "planned", permission: "planning.profile.read", breadcrumb: { labelKey: "planning.breadcrumb.profile", parentRouteId: "planning.home" } },
  ],
  screens: [
    ["planning.home", "planning.home", "planning.title.home", "planning.plans.read"], ["planning.plans.list", "planning.plans.list", "planning.title.list", "planning.plans.read"], ["planning.plans.create", "planning.plans.create", "planning.title.create", "planning.plans.manage"], ["planning.plans.detail", "planning.plans.detail", "planning.title.detail", "planning.plans.read"], ["planning.plans.edit", "planning.plans.edit", "planning.title.edit", "planning.plans.manage"], ["planning.profile", "planning.profile", "planning.title.profile", "planning.profile.read"],
  ].map(([screenId, routeId, titleKey, permission]) => ({ screenId, moduleId: "planning", capabilityId: screenId === "planning.profile" ? "planning.profile" : "planning.plans", routeId, titleKey, iconId: "planning", status: "planned", permission, policies: ["same-organization"], dataScope: "required", availability: "read_only_allowed", component: { exportName: "PlanningRemoteScreen" } })),
  actions: [
    action("planning.plans.create", "planning.plans.list", "planning.plans.create", "planning.plans.manage", "write"),
    action("planning.plans.update", "planning.plans.edit", "planning.plans.update", "planning.plans.manage", "write"),
    action("planning.profile.replace", "planning.profile", "planning.profile.replace", "planning.profile.manage", "write"),
    action("planning.plans.reload", "planning.plans.list", "planning.plans.list", "planning.plans.read", "read"),
  ],
  fallback: { unavailable: "planning.fallback.unavailable", incompatible: "planning.fallback.incompatible", integrityFailure: "planning.fallback.bundle_failure", degraded: "planning.fallback.read_only", upgradeRequired: "planning.fallback.upgrade_required" },
  security: { allowedOrigins: ["https://modules.civitas.invalid"], requiredCapabilities: ["planning.plans", "planning.profile"] },
};

function action(actionId: string, screenId: string, operationId: string, permission: string, kind: "read" | "write", confirmation: "required" | "none" = "none"): ModuleUiActionContribution { return { actionId, screenId, moduleId: "planning", capabilityId: screenId === "planning.profile" ? "planning.profile" : "planning.plans", operationId, permission, executionKind: kind, mutability: kind, status: "planned", presentation: { labelKey: `${actionId}.label`, iconId: kind === "write" ? "edit" : "refresh", confirmation } }; }
