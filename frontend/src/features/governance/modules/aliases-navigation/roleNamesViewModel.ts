import { appRoutes } from "../../../../navigation/routes";
import type { GovernanceRoleNameRow, GovernanceSurface } from "../../contracts";

export const displayCount = (count: number) => `${count} ${count === 1 ? "user" : "users"}`;
export const roleNameForSurface = (row: GovernanceRoleNameRow, surface: GovernanceSurface) => surface === "owner" ? row.canonicalBaselineLabel : row.civitasDefaultLabel;
export const displayNameForSurface = (row: GovernanceRoleNameRow, surface: GovernanceSurface) => surface === "owner" ? row.civitasDefaultLabel : row.effectiveLabel;
export const canResetRoleName = (row: GovernanceRoleNameRow, surface: GovernanceSurface) => surface === "owner" ? row.civitasDefaultLabel !== row.canonicalBaselineLabel : Boolean(row.organizationAlias);
export const usersHref = ({ surface, organizationId, canonicalRoleKey }: { surface: GovernanceSurface; organizationId: string; canonicalRoleKey: string }) => {
  const base = surface === "owner" ? appRoutes.ownerOrganizationGovernancePeopleSegmentation.build!({ organizationId }) : appRoutes.tenantGovernancePeopleSegmentation.build!({ organizationId });
  const params = new URLSearchParams({ role: canonicalRoleKey });
  return `${base}?${params.toString()}`;
};
export const modifiedAt = (row: GovernanceRoleNameRow) => row.updatedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.updatedAt)) : "Not changed";
export const modifiedBy = (row: GovernanceRoleNameRow) => row.updatedBy || "System";
