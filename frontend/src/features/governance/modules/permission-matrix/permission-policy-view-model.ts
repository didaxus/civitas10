import type { GovernancePermissionMatrixRow } from "../../contracts";
export type PermissionPolicyViewRow = { permissionId: string; label: string; description: string; checked: boolean; canChange: boolean; controlState: GovernancePermissionMatrixRow["controlState"] };
export type PermissionPolicyViewGroup = { key: string; label: string; order: number; rows: PermissionPolicyViewRow[] };
export const buildPermissionPolicyView = (rows: readonly GovernancePermissionMatrixRow[], roleId: string, pending: Record<string, boolean>, search: string): PermissionPolicyViewGroup[] => {
  const query=search.trim().toLowerCase(); const groups=new Map<string,PermissionPolicyViewGroup>();
  for(const row of [...rows].filter((item)=>item.roleId===roleId).sort((a,b)=>a.groupOrder-b.groupOrder||a.order-b.order)) { if(query&&!`${row.label} ${row.description} ${row.groupLabel}`.toLowerCase().includes(query)) continue; const group=groups.get(row.groupKey)||{key:row.groupKey,label:row.groupLabel,order:row.groupOrder,rows:[]}; group.rows.push({permissionId:row.permissionId,label:row.label,description:row.description,checked:pending[row.permissionId]??row.enabled,canChange:row.canChange,controlState:row.controlState}); groups.set(row.groupKey,group); }
  return [...groups.values()].sort((a,b)=>a.order-b.order);
};
