import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VisualAuthorizationContext } from "../../authorization/contracts/authorization-context";
import type { PermissionKey, CapabilityKey } from "../../authorization/contracts/ids";
import type { ScreenDefinition } from "../../authorization/contracts/screen-definition";
import { PlanningAccessFallback } from "./PlanningAccessFallback";
import { decidePlanningPresentation } from "./planningAccessDecision";

const screen = {
  screenId: "planning.plans.list",
  capability: "planning.plans",
  access: {
    requiredAllPermissions: ["planning.plans.read"],
    requiresOrganizationContext: true,
    requiresDataScope: true,
  },
} as unknown as ScreenDefinition;
const context = (organizationId = "org-a"): VisualAuthorizationContext => ({
  status: "ready",
  organizationId,
  policyVersion: "1",
  catalogVersion: "1",
  effectivePermissions: new Set(["planning.plans.read" as PermissionKey]),
  availableDataScopeCapabilities: new Set(["planning.plans" as CapabilityKey]),
  enabledFeatures: new Set(),
  policyDecisions: new Map(),
});

describe("Planning host access presentation", () => {
  it("renders denied without mounting remote content", () => {
    const denied = { ...context(), effectivePermissions: new Set<PermissionKey>() };
    expect(decidePlanningPresentation("org-a", screen, denied, true)).toBe("denied");
    expect(renderToStaticMarkup(<PlanningAccessFallback state="denied" />)).toContain("do not have access");
  });

  it("renders unavailable when the canonical context lacks the capability", () => {
    const unavailable = { ...context(), availableDataScopeCapabilities: new Set<CapabilityKey>() };
    expect(decidePlanningPresentation("org-a", screen, unavailable, true)).toBe("unavailable");
    expect(renderToStaticMarkup(<PlanningAccessFallback state="unavailable" />)).toContain("unavailable");
  });

  it("renders incompatible for a rejected contribution", () => {
    expect(decidePlanningPresentation("org-a", screen, context(), false)).toBe("incompatible");
    expect(renderToStaticMarkup(<PlanningAccessFallback state="incompatible" />)).toContain("incompatible");
  });

  it("fails closed while AuthorizationContext still belongs to the previous organization", () => {
    expect(decidePlanningPresentation("org-b", screen, context("org-a"), true)).toBe("loading");
    expect(decidePlanningPresentation("org-b", screen, context("org-b"), true)).toBe("ready");
  });
});
