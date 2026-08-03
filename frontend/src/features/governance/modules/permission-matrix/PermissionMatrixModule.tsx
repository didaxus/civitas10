import { useMemo, useState } from "react";
import { EmptyState, FilterBar, PermissionGroupAccordion, RoleSelector, SectionCard, type PermissionToggleRow } from "../../../../shared/ui";
import type { GovernancePermissionMatrixRow, GovernanceRoleSummary, GovernanceSurface, GovernanceVersionSummary } from "../../contracts";

type PendingChange = { permission: string; enabled: boolean };
type PermissionRowState = { item: PermissionToggleRow; row: GovernancePermissionMatrixRow; eligible: boolean };
type PermissionMutationInput = { roleId: string; expectedPolicyVersion?: string; changes: PendingChange[]; reason: string };

const groupNames: Record<string, string> = { org: "Organization", lms: "Learning", planning: "Planning", account: "Account", owner: "Core Manager" };
const actionNames: Record<string, string> = { read: "View", create: "Create", invite: "Invite", update: "Manage", write: "Manage", assign: "Assign", delete: "Delete", execute: "Run", manage: "Manage" };
const resourceNames: Record<string, string> = { members: "members", invitations: "member invitations", roles: "roles", settings: "settings", documents: "documents", groups: "groups", courses: "courses", plans: "plans" };
const sentence = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}.`;
const capabilityCopy = (row: GovernancePermissionMatrixRow) => {
  const parts = String(row.permission).split(".");
  const action = actionNames[parts[parts.length - 1] || ""] || "Use";
  const resource = resourceNames[parts[parts.length - 2] || ""] || "this capability";
  const safeDisplayName = row.displayName && !row.displayName.includes(".") ? row.displayName : `${action} ${resource}`;
  const safeDescription = row.description && !/[a-z]+\.[a-z]+/i.test(row.description) ? row.description : sentence(`${action.toLowerCase()} ${resource}`);
  return { label: safeDisplayName, description: safeDescription };
};
const groupLabel = (permission: string) => groupNames[permission.split(".")[0] || ""] || "Other";
const rowEnabled = (row: GovernancePermissionMatrixRow, surface: GovernanceSurface) => surface === "owner" ? row.ownerAllowed === true : row.tenantEnabled === true;
const rowEligible = (row: GovernancePermissionMatrixRow, surface: GovernanceSurface) => row.canonical && row.rolePotential === true && (surface === "owner" || row.ownerAllowed === true) && row.reason.code !== "owning_operation_not_mounted";
const unavailableCopy = (surface: GovernanceSurface, row: GovernancePermissionMatrixRow) => {
  if (surface === "owner") return "Not available for this organization. Contact support to make this capability available for your organization.";
  if (row.ownerAllowed !== true) return "Not available for your organization. Contact support to make this capability available for your organization.";
  return "Not enabled by your organization.";
};

export const PermissionMatrixModule = ({ rows, roles = [], surface, versions, onSaveOwnerCeilings, onSaveTenantActivations }: {
  organizationId: string;
  rows: readonly GovernancePermissionMatrixRow[];
  roles?: readonly GovernanceRoleSummary[];
  surface: GovernanceSurface;
  versions?: GovernanceVersionSummary;
  onSaveOwnerCeilings?: (input: PermissionMutationInput) => Promise<unknown>;
  onSaveTenantActivations?: (input: PermissionMutationInput) => Promise<unknown>;
}) => {
  const roleOptions = useMemo(() => {
    const knownRoles = roles.map((role) => ({ canonicalRoleId: role.id, alias: role.displayName || "Organization role" }));
    if (knownRoles.length) return knownRoles;
    return [...new Set(rows.map((row) => row.roleId).filter((id): id is string => Boolean(id)))].map((id, index) => ({ canonicalRoleId: id, alias: `Organization role ${index + 1}` }));
  }, [roles, rows]);
  const [selectedRoleId, setSelectedRoleId] = useState(() => roleOptions[0]?.canonicalRoleId || "");
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, PendingChange>>({});
  const [reviewing, setReviewing] = useState(false);
  const [feedback, setFeedback] = useState<{ state: "idle" | "saving" | "saved" | "error"; message?: string }>({ state: "idle" });
  const effectiveRoleId = selectedRoleId || roleOptions[0]?.canonicalRoleId || "";
  const selectedRoleLabel = roleOptions.find((role) => role.canonicalRoleId === effectiveRoleId)?.alias || "selected role";
  const roleRows = useMemo(() => rows.filter((row) => row.roleId === effectiveRoleId), [effectiveRoleId, rows]);
  const selectedRowByPermission = useMemo(() => new Map(roleRows.map((row) => [row.permission, row])), [roleRows]);
  const pendingList = Object.values(pending).filter((change) => {
    const row = selectedRowByPermission.get(change.permission);
    return row ? rowEnabled(row, surface) !== change.enabled : false;
  });
  const buildRowState = (row: GovernancePermissionMatrixRow): PermissionRowState => {
    const eligible = rowEligible(row, surface);
    const copy = capabilityCopy(row);
    return { item: { permissionId: row.permission, ...copy, checked: pending[row.permission]?.enabled ?? rowEnabled(row, surface), disabled: !eligible, availabilityMessage: eligible ? undefined : unavailableCopy(surface, row) }, row, eligible };
  };
  const allGrouped = roleRows.reduce((groups, row) => {
    const domain = groupLabel(row.permission);
    groups.set(domain, [...(groups.get(domain) || []), buildRowState(row)]);
    return groups;
  }, new Map<string, PermissionRowState[]>());
  const normalizedFilter = filter.trim().toLowerCase();
  const grouped = [...allGrouped.entries()].map(([domain, items]) => [domain, items.filter(({ item }) => !normalizedFilter || `${item.label} ${item.description}`.toLowerCase().includes(normalizedFilter))] as const).filter(([, items]) => items.length);
  const enabledCount = roleRows.filter((row) => pending[row.permission]?.enabled ?? rowEnabled(row, surface)).length;

  const togglePermission = (permission: string, enabled: boolean) => setPending((current) => {
    const row = selectedRowByPermission.get(permission); const next = { ...current };
    if (row && rowEnabled(row, surface) === enabled) delete next[permission]; else next[permission] = { permission, enabled };
    return next;
  });
  const toggleGroup = (items: PermissionRowState[], enabled: boolean) => setPending((current) => {
    const next = { ...current };
    for (const { item, row, eligible } of items) if (eligible) { if (rowEnabled(row, surface) === enabled) delete next[item.permissionId]; else next[item.permissionId] = { permission: item.permissionId, enabled }; }
    return next;
  });
  const save = async () => {
    const writer = surface === "owner" ? onSaveOwnerCeilings : onSaveTenantActivations;
    if (!writer || !effectiveRoleId || !pendingList.length || !versions?.policyVersion) return;
    setFeedback({ state: "saving", message: "Saving changes…" });
    try {
      await writer({ roleId: effectiveRoleId, expectedPolicyVersion: versions.policyVersion, changes: pendingList, reason: surface === "owner" ? "owner_ceiling_update" : "tenant_activation_update" });
      setPending({}); setReviewing(false); setFeedback({ state: "saved", message: "Permissions saved. The activity is available in Logs." });
    } catch { setFeedback({ state: "error", message: "Changes could not be saved. Please refresh and try again." }); }
  };

  if (!roleOptions.length) return <SectionCard title="Roles & Permissions" description="Manage the permissions available to each role."><EmptyState message="No roles are available for this organization." /></SectionCard>;
  return <SectionCard title="Roles & Permissions" description="Manage the permissions available to each role.">
    <div className="civitas-workspace-stack">
      <RoleSelector id="governance-role-selector" label="Role" value={effectiveRoleId} roles={roleOptions} onChange={(roleId) => { setSelectedRoleId(roleId); setPending({}); setReviewing(false); }} />
      <p className="text-sm font-semibold text-text" aria-live="polite">{enabledCount} of {roleRows.length} permissions enabled</p>
      <FilterBar searchLabel="Search permissions" searchValue={filter} onSearchChange={setFilter} onReset={() => setFilter("")} />
      {!grouped.length ? <EmptyState message="No permissions match your search." /> : null}
      {grouped.map(([domain, items]) => <PermissionGroupAccordion key={domain} domain={domain} expanded={expanded[domain] ?? false} activeCount={(allGrouped.get(domain) || []).filter(({ item }) => item.checked).length} totalCount={(allGrouped.get(domain) || []).length} roleLabel={selectedRoleLabel} rows={items.map(({ item }) => item)} onExpandedChange={(isExpanded) => setExpanded((current) => ({ ...current, [domain]: isExpanded }))} onTogglePermission={togglePermission} onToggleGroup={(enabled) => toggleGroup(allGrouped.get(domain) || [], enabled)} />)}
      {pendingList.length ? <div className="civitas-card civitas-pad-tight civitas-action-bar" aria-live="polite">
        <p className="text-sm font-semibold text-text">{pendingList.length} pending {pendingList.length === 1 ? "change" : "changes"}</p>
        {!reviewing ? <><button type="button" className="civitas-secondary-button" onClick={() => setPending({})}>Discard</button><button type="button" className="civitas-primary-button" onClick={() => setReviewing(true)}>Review & Save</button></> : <div className="civitas-workspace-stack" aria-label="Review permission changes"><h3 className="font-semibold text-text">Review changes</h3><ul className="text-sm text-muted-strong">{pendingList.map((change) => <li key={change.permission}>{capabilityCopy(selectedRowByPermission.get(change.permission)!).label}: {change.enabled ? "Enable" : "Disable"}</li>)}</ul><div className="civitas-cluster"><button type="button" className="civitas-secondary-button" onClick={() => setReviewing(false)} disabled={feedback.state === "saving"}>Back</button><button type="button" className="civitas-primary-button" onClick={() => void save()} disabled={feedback.state === "saving"}>{feedback.state === "saving" ? "Saving…" : "Save changes"}</button></div></div>}
      </div> : null}
      {feedback.message ? <p role="status" className={feedback.state === "error" ? "text-sm text-danger" : "text-sm text-muted-strong"}>{feedback.message}</p> : null}
    </div>
  </SectionCard>;
};
