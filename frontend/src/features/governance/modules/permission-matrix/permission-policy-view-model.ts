import type { GovernancePermissionMatrixRow } from "../../contracts";

/**
 * Permission Policy View Row for two-level RBAC model.
 * - In Owner surface: toggle controls ownerAllowed
 * - In Tenant surface: toggle controls tenantEnabled
 */
export type PermissionPolicyViewRow = { 
  permissionId: string; 
  label: string; 
  description: string; 
  checked: boolean; 
  canChange: boolean; 
  controlState: GovernancePermissionMatrixRow["controlState"];
  // Two-level RBAC state fields
  rolePotential?: boolean;
  ownerAllowed?: boolean;
  tenantEnabled?: boolean;
  identityProvisioned?: boolean;
  runtimeAvailable?: boolean;
  organizationAvailable?: boolean;
  effective?: boolean;
};

export type PermissionPolicyViewGroup = { 
  key: string; 
  label: string; 
  order: number; 
  rows: PermissionPolicyViewRow[];
  // Group summary counts
  totalPermissions: number;
  enabledPermissions: number;
};

export const buildPermissionPolicyView = (
  rows: readonly GovernancePermissionMatrixRow[], 
  roleId: string, 
  pending: Record<string, boolean>, 
  search: string
): PermissionPolicyViewGroup[] => {
  const query = search.trim().toLowerCase(); 
  const groups = new Map<string, PermissionPolicyViewGroup>();
  
  for (const row of [...rows]
    .filter((item) => item.roleId === roleId)
    .sort((a, b) => a.groupOrder - b.groupOrder || a.order - b.order)) { 
    
    if (query && !`${row.label} ${row.description} ${row.groupLabel}`.toLowerCase().includes(query)) continue; 
    
    const group = groups.get(row.groupKey) || { 
      key: row.groupKey, 
      label: row.groupLabel, 
      order: row.groupOrder, 
      rows: [],
      totalPermissions: 0,
      enabledPermissions: 0
    }; 
    
    const viewRow: PermissionPolicyViewRow = {
      permissionId: row.permissionId,
      label: row.label,
      description: row.description,
      checked: pending[row.permissionId] ?? row.enabled,
      canChange: row.canChange,
      controlState: row.controlState,
      // Pass through two-level RBAC state fields
      rolePotential: (row as any).rolePotential,
      ownerAllowed: (row as any).ownerAllowed,
      tenantEnabled: (row as any).tenantEnabled,
      identityProvisioned: (row as any).identityProvisioned,
      runtimeAvailable: (row as any).runtimeAvailable,
      organizationAvailable: (row as any).organizationAvailable,
      effective: (row as any).effective
    };
    
    group.rows.push(viewRow);
    group.totalPermissions++;
    if (viewRow.checked) group.enabledPermissions++;
    
    groups.set(row.groupKey, group); 
  }
  
  return [...groups.values()].sort((a, b) => a.order - b.order);
};
