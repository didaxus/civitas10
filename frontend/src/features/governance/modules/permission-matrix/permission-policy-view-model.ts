import type { GovernancePermissionMatrixRow, GovernanceSurface } from "../../contracts";
import type { PermissionControlState } from "../../../../shared/ui";

const ownerUnavailableMessage = (state: PermissionControlState) => ({
  not_executable: "This capability cannot be authorized until it becomes operational.",
  runtime_unavailable: "This capability is temporarily unavailable because its runtime is not operational.",
  globally_locked: "This capability is locked by the platform authorization policy.",
  blocked_by_owner: "This capability is not available for authorization.",
  editable: "This capability is available.",
})[state];
const tenantUnavailableMessage = (state: PermissionControlState) => ({
  blocked_by_owner: "Contact support to make this capability available for your organization.",
  not_executable: "This capability is not yet available for your organization.",
  runtime_unavailable: "This capability is temporarily unavailable.",
  globally_locked: "This capability is locked by the platform authorization policy.",
  editable: "This capability is available.",
})[state];
export type PermissionPolicyViewRow = { permissionId: string; label: string; description: string; checked: boolean; canChange: boolean; controlState: GovernancePermissionMatrixRow["controlState"]; unavailableMessage: string; rolePotential: true; ownerAllowed: boolean; tenantEnabled: boolean; runtimeAvailable: boolean; effective: boolean };
export type PermissionPolicyViewGroup = { key: string; label: string; order: number; rows: PermissionPolicyViewRow[]; totalPermissions: number; enabledPermissions: number };
export const buildPermissionPolicyView = (rows: readonly GovernancePermissionMatrixRow[], roleId: string, pending: Record<string, boolean>, search: string, surface: GovernanceSurface = "owner"): PermissionPolicyViewGroup[] => {
  const query = search.trim().toLowerCase(); const groups = new Map<string, PermissionPolicyViewGroup>();
  for (const row of [...rows].filter((item) => item.roleId === roleId).sort((a, b) => a.groupOrder - b.groupOrder || a.order - b.order)) {
    if (query && !`${row.label} ${row.description} ${row.groupLabel}`.toLowerCase().includes(query)) continue;
    const group = groups.get(row.groupKey) || { key: row.groupKey, label: row.groupLabel, order: row.groupOrder, rows: [], totalPermissions: 0, enabledPermissions: 0 };
    const viewRow: PermissionPolicyViewRow = { permissionId: row.permissionId, label: row.label, description: row.description, checked: pending[row.permissionId] ?? (surface === "owner" ? row.ownerAllowed : row.tenantEnabled), canChange: row.canChange, controlState: row.controlState, unavailableMessage: surface === "owner" ? ownerUnavailableMessage(row.controlState) : tenantUnavailableMessage(row.controlState), rolePotential: row.rolePotential, ownerAllowed: row.ownerAllowed, tenantEnabled: row.tenantEnabled, runtimeAvailable: row.runtimeAvailable, effective: row.effective };
    group.rows.push(viewRow); group.totalPermissions++; if (viewRow.checked) group.enabledPermissions++; groups.set(row.groupKey, group);
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
};
