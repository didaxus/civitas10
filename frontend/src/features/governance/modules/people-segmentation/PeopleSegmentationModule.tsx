import { useMemo } from "react";
import { useLocation } from "react-router";
import { DataTable, EmptyState, KpiGrid, MetricCard, SectionCard, StatusPill, type DataTableColumn } from "../../../../shared/ui";
import type { GovernanceAutomaticRoleSegment, GovernanceSegmentationReadModel } from "../../contracts";

const formatUsers = (count: number) => `${count} ${count === 1 ? "user" : "users"}`;

export const PeopleSegmentationModule = ({ segmentation }: { segmentation?: GovernanceSegmentationReadModel }) => {
  const { search } = useLocation();
  const roleFilter = new URLSearchParams(search).get("role") || "";
  const selected = useMemo(() => {
    const segments = segmentation?.segments || [];
    return segments.find((segment) => segment.canonicalRoleKey === roleFilter) || segments[0] || null;
  }, [roleFilter, segmentation?.segments]);
  const memberColumns: DataTableColumn<GovernanceAutomaticRoleSegment["directMembers"][number]>[] = [
    { key: "user", header: "User", render: (row) => row.user },
    { key: "email", header: "Email", render: (row) => row.email || "Not available" },
    { key: "assignment", header: "Assignment", render: (row) => row.assignment },
    { key: "status", header: "Status", render: (row) => <StatusPill status="success">{row.status}</StatusPill> },
  ];
  if (!selected) return <SectionCard title="Segmentation" description="Review the users and authorization cohorts associated with organization roles."><EmptyState message="No automatic role segments are available." /></SectionCard>;
  return <SectionCard title="Segmentation" description="Review the users and authorization cohorts associated with organization roles."><div className="civitas-workspace-stack"><div><p className="text-sm text-muted-strong">Role</p><p className="text-lg font-semibold">{selected.effectiveDisplayName}</p></div><KpiGrid cols={4}><MetricCard label="Direct role users" value={String(selected.directRoleUserCount)} /><MetricCard label="Owner-authorized capabilities" value={String(selected.sourceSummary.pbac.ownerAllowedPermissionCount)} /><MetricCard label="Organization-enabled capabilities" value={String(selected.sourceSummary.pbac.tenantEnabledPermissionCount)} /><MetricCard label="Scoped users" value={String(selected.sourceSummary.abac.scopedUserCount)} /></KpiGrid>{selected.directMembers.length ? <DataTable columns={memberColumns} data={selected.directMembers} getKey={(row) => `${row.email || row.user}:${row.assignment}`} /> : <EmptyState message={`No users are directly assigned to ${selected.effectiveDisplayName}.`} />}<div className="grid gap-3 md:grid-cols-3"><section className="civitas-card civitas-pad-tight"><h3 className="font-semibold">RBAC</h3><p>Direct role users</p><p className="text-sm text-muted-strong">Users explicitly assigned to this organization role.</p><strong>{formatUsers(selected.sourceSummary.rbac.directUserCount)}</strong></section><section className="civitas-card civitas-pad-tight"><h3 className="font-semibold">PBAC</h3><p className="text-sm text-muted-strong">PBAC reduces capability availability; it does not add users to the role.</p><p>Owner-authorized: {selected.sourceSummary.pbac.ownerAllowedPermissionCount}</p><p>Organization-enabled: {selected.sourceSummary.pbac.tenantEnabledPermissionCount}</p></section><section className="civitas-card civitas-pad-tight"><h3 className="font-semibold">ABAC</h3><p className="text-sm text-muted-strong">ABAC partitions direct role members by registered scopes; it does not add users to the role.</p><p>Scope assignments: {selected.sourceSummary.abac.scopeAssignmentCount}</p><p>Scoped users: {selected.sourceSummary.abac.scopedUserCount}</p></section></div><p className="text-sm text-muted-strong">direct RBAC role members INTERSECT PBAC-enabled capability INTERSECT ABAC-valid scope or relationship = effective capability cohort</p></div></SectionCard>;
};
