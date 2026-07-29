import { useMemo, useState } from "react";
import { EmptyState, FilterBar, PermissionGroupAccordion, RoleSelector, SectionCard, type PermissionToggleRow } from "../../../../shared/ui";
import type { GovernancePermissionMatrixRow, GovernanceRoleSummary, GovernanceSurface, GovernanceVersionSummary } from "../../contracts";

import { reasonLabel } from "./reason-format";

type PendingChange = { permission: string; enabled: boolean };
type PermissionRowState = { item: PermissionToggleRow; row: GovernancePermissionMatrixRow; eligible: boolean };

type PermissionMutationInput = {
  roleId: string;
  expectedPolicyVersion?: string;
  changes: PendingChange[];
  reason: string;
};

const domainLabel = (permission: string) => permission.split(".")[0]?.toUpperCase() || "OTHER";
const rowEnabled = (row: GovernancePermissionMatrixRow, surface: GovernanceSurface) => surface === "owner" ? row.ownerAllowed === true : row.tenantEnabled === true;
const rowEligible = (row: GovernancePermissionMatrixRow, surface: GovernanceSurface) => {
  if (!row.canonical || row.rolePotential !== true) return false;
  if (surface === "tenant" && row.ownerAllowed !== true) return false;
  if (row.reason.code === "owning_operation_not_mounted") return false;
  return true;
};
const rowReason = (row: GovernancePermissionMatrixRow, surface: GovernanceSurface) => {
  if (!row.canonical) return "permission_missing";
  if (row.rolePotential !== true) return "role_permission_missing";
  if (surface === "tenant" && row.ownerAllowed !== true) return "owner_ceiling_denied";
  return row.reason.code;
};

export const PermissionMatrixModule = ({
  organizationId,
  rows,
  roles = [],
  surface,
  versions,
  onSaveOwnerCeilings,
  onSaveTenantActivations,
}: {
  organizationId: string;
  rows: readonly GovernancePermissionMatrixRow[];
  roles?: readonly GovernanceRoleSummary[];
  surface: GovernanceSurface;
  versions?: GovernanceVersionSummary;
  onSaveOwnerCeilings?: (input: PermissionMutationInput) => Promise<unknown>;
  onSaveTenantActivations?: (input: PermissionMutationInput) => Promise<unknown>;
}) => {
  void organizationId;
  const roleOptions = useMemo(() => {
    const byId = new Map<string, GovernanceRoleSummary>();
    for (const role of roles) byId.set(role.id, role);
    for (const row of rows) if (row.roleId && !byId.has(row.roleId)) byId.set(row.roleId, { id: row.roleId, canonicalKey: row.roleKey || row.roleId, displayName: row.roleKey || row.roleId, assignedMemberCount: 0, potentialPermissions: [], ceilingCoverage: 0 });
    return [...byId.values()].map((role) => ({ canonicalRoleId: role.id, alias: role.displayName || role.canonicalKey || role.id, status: role.canonicalKey }));
  }, [roles, rows]);
  const readUrlState = () => new URLSearchParams(globalThis.location?.search || "");
  const writeUrlState = (updates: { role?: string; filter?: string }) => {
    const params = readUrlState();
    if (updates.role !== undefined) {
      if (updates.role) params.set("role", updates.role);
      else params.delete("role");
    }
    if (updates.filter !== undefined) {
      if (updates.filter) params.set("filter", updates.filter);
      else params.delete("filter");
    }
    const query = params.toString();
    globalThis.history?.replaceState(null, "", `${globalThis.location?.pathname || ""}${query ? `?${query}` : ""}`);
  };
  const [selectedRoleId, setSelectedRoleId] = useState(() => readUrlState().get("role") || roleOptions[0]?.canonicalRoleId || "");
  const [filter, setFilter] = useState(() => readUrlState().get("filter") || "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, PendingChange>>({});
  const [feedback, setFeedback] = useState<{ state: "idle" | "saving" | "saved" | "error"; message?: string }>({ state: "idle" });
  const effectiveRoleId = selectedRoleId || roleOptions[0]?.canonicalRoleId || "";
  const selectedRoleLabel = roleOptions.find((role) => role.canonicalRoleId === effectiveRoleId)?.alias || effectiveRoleId || "selected role";
  const roleRows = useMemo(() => rows.filter((row) => row.roleId === effectiveRoleId), [effectiveRoleId, rows]);
  const normalizedFilter = filter.trim().toLowerCase();
  const rowMatchesFilter = (row: GovernancePermissionMatrixRow) => !normalizedFilter
    || row.permission.toLowerCase().includes(normalizedFilter)
    || String(row.displayName || "").toLowerCase().includes(normalizedFilter)
    || String(row.description || "").toLowerCase().includes(normalizedFilter);
  const selectedRows = roleRows.filter(rowMatchesFilter);
  const selectedRowByPermission = useMemo(() => new Map(roleRows.map((row) => [row.permission, row])), [roleRows]);
  const pendingList = Object.values(pending).filter((change) => {
    const row = selectedRowByPermission.get(change.permission);
    return row ? rowEnabled(row, surface) !== change.enabled : false;
  });
  const pendingCount = pendingList.length;
  const buildRowState = (row: GovernancePermissionMatrixRow): PermissionRowState => {
    const override = pending[row.permission]?.enabled;
    const currentEnabled = override ?? rowEnabled(row, surface);
    const writerRegistered = surface === "owner" ? Boolean(onSaveOwnerCeilings) : Boolean(onSaveTenantActivations);
    const eligible = writerRegistered && rowEligible(row, surface);
    return { item: { permissionId: row.permission, label: row.displayName || row.permission, description: row.description, checked: currentEnabled, disabled: !eligible, reason: reasonLabel(rowReason(row, surface)) }, row, eligible };
  };
  const allGrouped = useMemo(() => roleRows.reduce((groups, row) => {
    const domain = domainLabel(row.permission);
    const existing = groups.get(domain) || [];
    existing.push(buildRowState(row));
    groups.set(domain, existing);
    return groups;
  }, new Map<string, PermissionRowState[]>()), [pending, roleRows, surface]);
  const grouped = useMemo(() => selectedRows.reduce((groups, row) => {
    const domain = domainLabel(row.permission);
    const existing = groups.get(domain) || [];
    existing.push(buildRowState(row));
    groups.set(domain, existing);
    return groups;
  }, new Map<string, PermissionRowState[]>()), [pending, selectedRows, surface]);

  const togglePermission = (permission: string, enabled: boolean) => setPending((current) => {
    const row = selectedRowByPermission.get(permission);
    const next = { ...current };
    if (row && rowEnabled(row, surface) === enabled) delete next[permission];
    else next[permission] = { permission, enabled };
    return next;
  });
  const toggleGroup = (items: PermissionRowState[], enabled: boolean) => setPending((current) => {
    const next = { ...current };
    for (const { item, row, eligible } of items) {
      if (!eligible) continue;
      if (rowEnabled(row, surface) === enabled) delete next[item.permissionId];
      else next[item.permissionId] = { permission: item.permissionId, enabled };
    }
    return next;
  });
  const save = async () => {
    const writer = surface === "owner" ? onSaveOwnerCeilings : onSaveTenantActivations;
    if (!writer || !effectiveRoleId || pendingCount === 0 || !versions?.policyVersion) return;
    setFeedback({ state: "saving", message: "Saving permission policy changes…" });
    try {
      await writer({ roleId: effectiveRoleId, expectedPolicyVersion: versions.policyVersion, changes: pendingList, reason: surface === "owner" ? "owner_ceiling_update" : "tenant_activation_update" });
      setPending({});
      setFeedback({ state: "saved", message: "Policy changes saved. Refresh the read model to see the new policy version." });
    } catch (error) {
      setFeedback({ state: "error", message: error instanceof Error ? error.message : "Policy update failed. Check version and retry." });
    }
  };

  if (!roleOptions.length) return <SectionCard title="Role permissions" description="Select one canonical role to manage its permissions."><EmptyState message="No roles available"><p className="text-sm text-muted-strong">The persisted governance policy read model did not return canonical roles.</p></EmptyState></SectionCard>;

  return (
    <SectionCard title={surface === "owner" ? "Owner Ceiling policy" : "Tenant Activation policy"} description={surface === "owner" ? "Select one canonical role and edit only Owner Ceiling decisions." : "Select one canonical role and edit only Tenant Activations allowed by Owner Ceiling."}>
      <div className="civitas-workspace-stack">
        <RoleSelector id="governance-role-selector" label="Canonical role" value={effectiveRoleId} roles={roleOptions} onChange={(roleId) => { setSelectedRoleId(roleId); setPending({}); writeUrlState({ role: roleId }); }} />
        <FilterBar searchLabel="Search permissions" searchValue={filter} onSearchChange={(value) => { setFilter(value); writeUrlState({ filter: value }); }} onReset={() => { setFilter(""); writeUrlState({ filter: "" }); }}>
        </FilterBar>
        {grouped.size === 0 ? <EmptyState message="No permissions match the current filter"><p className="text-sm text-muted-strong">Adjust the search filter or select a different role to view permissions.</p></EmptyState> : null}
        {[...grouped.entries()].map(([domain, items]) => {
          const allItems = allGrouped.get(domain) || [];
          const activeCount = allItems.filter(({ item }) => item.checked).length;
          return <PermissionGroupAccordion key={domain} domain={domain} expanded={expanded[domain] ?? false} activeCount={activeCount} totalCount={allItems.length} roleLabel={selectedRoleLabel} rows={items.map(({ item }) => item)} onExpandedChange={(isExpanded) => setExpanded((current) => ({ ...current, [domain]: isExpanded }))} onTogglePermission={togglePermission} onToggleGroup={(enabled) => toggleGroup(allItems, enabled)} />;
        })}
        {pendingCount ? <div className="civitas-card civitas-pad-tight civitas-action-bar" aria-live="polite">
          <p className="text-sm font-semibold text-text">{pendingCount} unsaved changes</p>
          {feedback.message ? <p className={feedback.state === "error" ? "text-sm text-danger" : "text-sm text-muted-strong"}>{feedback.message}</p> : null}
          <button type="button" className="civitas-secondary-button" onClick={() => setPending({})} disabled={!pendingCount || feedback.state === "saving"}>Discard</button><button type="button" className="civitas-primary-button" onClick={() => void save()} disabled={!pendingCount || feedback.state === "saving"}>{feedback.state === "saving" ? "Saving…" : "Save changes"}</button>
        </div> : null}
      </div>
    </SectionCard>
  );
};
