import type { MetricStripItem } from "../MetricStrip";
import type { RoleSelectorOption } from "../RoleSelector";
import type { PermissionToggleRow } from "../PermissionGroupAccordion";

export const governancePatternFixture = {
  states: ["loading", "empty", "error", "denied", "stale"] as const,
  roles: [
    { canonicalRoleId: "organization_admin", alias: "Administrator" },
    { canonicalRoleId: "organization_groupleader", alias: "Group Director" },
  ] satisfies RoleSelectorOption[],
  permissions: [
    { permissionId: "lms.groups.read", label: "Read groups", description: "View organization members.", checked: true, canChange: true },
    { permissionId: "lms.group_members.read", label: "View group members", description: "View members assigned to learning groups.", checked: false, canChange: false },
  ] satisfies PermissionToggleRow[],
  metrics: [
    { label: "Active permissions", value: "2 of 3", detail: "One tenant activation missing" },
    { label: "Scope assignments", value: "8", detail: "Membership-role bound" },
  ] satisfies MetricStripItem[],
};
