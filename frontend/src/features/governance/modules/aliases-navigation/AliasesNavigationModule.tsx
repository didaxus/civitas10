import { useEffect, useMemo, useRef, useState } from "react";
import { FilterBar, SectionCard } from "../../../../shared/ui";
import type { GovernanceRoleNamesReadModel, GovernanceRoleNameRow, GovernanceSurface } from "../../contracts";
import { RoleNameEditorDrawer } from "./RoleNameEditorDrawer";
import { RoleNamesTable } from "./RoleNamesTable";
import { roleNameMutationErrorMessage } from "./roleNamesErrors";
import { displayNameForSurface, roleNameForSurface } from "./roleNamesViewModel";

type MutationInput = { canonicalRoleKey: string; displayName: string | null; expectedVersion: string; reason: string };
type MutationResponse = { row?: Partial<GovernanceRoleNameRow> } | unknown;

const hasForbiddenCharacter = (value: string) => Array.from(value).some((char) => { const code = char.codePointAt(0) || 0; return code <= 0x1f || (code >= 0x7f && code <= 0x9f) || code === 0x061c || code === 0x200e || code === 0x200f || (code >= 0x202a && code <= 0x202e) || (code >= 0x2066 && code <= 0x2069); });
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ");
const validate = (value: string) => { const normalized = normalize(value); if (!normalized) return "Use Reset when you want to remove a display name."; if (normalized.length < 2 || normalized.length > 80) return "Use 2-80 characters."; if (hasForbiddenCharacter(normalized)) return "Control and bidi override characters are not allowed."; if (/^[\p{P}\p{S}\s]+$/u.test(normalized)) return "Use letters or numbers, not only punctuation."; return ""; };
const hasReturnedRow = (value: MutationResponse): value is { row: Partial<GovernanceRoleNameRow> } => typeof value === "object" && value !== null && "row" in value && typeof (value as { row?: unknown }).row === "object" && (value as { row?: unknown }).row !== null;

export const AliasesNavigationModule = ({ roleNames, surface, organizationId, organizationName, onUpdateOwnerRoleLabel, onUpdateOrganizationRoleAlias, onReload }: { roleNames?: GovernanceRoleNamesReadModel; surface: GovernanceSurface; organizationId: string; organizationName?: string | null; onUpdateOwnerRoleLabel?: (input: MutationInput) => Promise<MutationResponse>; onUpdateOrganizationRoleAlias?: (input: MutationInput) => Promise<MutationResponse>; onReload?: () => Promise<void> }) => {
  const [query, setQuery] = useState("");
  const [selectedRow, setSelectedRow] = useState<GovernanceRoleNameRow | null>(null);
  const [localPatches, setLocalPatches] = useState<Record<string, Partial<GovernanceRoleNameRow>>>({});
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [pageMessage, setPageMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState(false);
  const opener = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    queueMicrotask(() => { setLocalPatches({}); setSelectedRow(null); setValue(""); setMessage(""); setPageMessage(""); setResetConfirmation(false); });
  }, [roleNames?.organizationId, roleNames?.rows, surface]);

  const rows = useMemo(() => (roleNames?.rows || []).map((row) => ({ ...row, ...(localPatches[row.canonicalRoleKey] || {}) })).filter((row) => [roleNameForSurface(row, surface), displayNameForSurface(row, surface)].join(" ").toLocaleLowerCase().includes(query.toLocaleLowerCase())), [localPatches, query, roleNames?.rows, surface]);
  const open = (row: GovernanceRoleNameRow, openerButton: HTMLButtonElement, reset = false) => { opener.current = openerButton; setSelectedRow(row); setValue(surface === "owner" ? (row.civitasDefaultLabel === row.canonicalBaselineLabel ? "" : row.civitasDefaultLabel) : (row.organizationAlias || "")); setMessage(""); setPageMessage(""); setResetConfirmation(reset); };
  const close = () => { setSelectedRow(null); setMessage(""); setResetConfirmation(false); opener.current?.focus(); };
  const applyReturnedRow = (target: GovernanceRoleNameRow, response: MutationResponse, reset: boolean) => {
    const fallbackPatch = surface === "owner" ? { civitasDefaultLabel: reset ? target.canonicalBaselineLabel : normalize(value), effectiveLabel: reset ? target.canonicalBaselineLabel : normalize(value) } : { organizationAlias: reset ? null : normalize(value), effectiveLabel: reset ? target.civitasDefaultLabel : normalize(value) };
    const patch = hasReturnedRow(response) ? response.row : fallbackPatch;
    setLocalPatches((current) => ({ ...current, [target.canonicalRoleKey]: { ...current[target.canonicalRoleKey], ...patch } }));
  };
  const save = async (reset = false) => {
    if (!selectedRow) return;
    const err = reset ? "" : validate(value);
    if (err) { setMessage(err); return; }
    const fn = surface === "owner" ? onUpdateOwnerRoleLabel : onUpdateOrganizationRoleAlias;
    if (!fn) return;
    setSaving(true);
    setMessage("");
    setPageMessage("");
    try {
      const response = await fn({ canonicalRoleKey: selectedRow.canonicalRoleKey, displayName: reset ? null : normalize(value), expectedVersion: surface === "owner" ? roleNames?.globalVersion || selectedRow.globalVersion : roleNames?.organizationVersion || selectedRow.organizationVersion, reason: reset ? "Reset role display name" : "Update role display name" });
      applyReturnedRow(selectedRow, response, reset);
      close();
      setPageMessage("Display name saved.");
      try { await onReload?.(); } catch { setPageMessage("Display name was saved, but the latest data could not be refreshed."); }
    } catch (error) {
      setMessage(roleNameMutationErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };
  const owner = surface === "owner";
  return <SectionCard title="Role names" description={owner ? "Manage the display names used across Civitas." : "Manage the display names used in this organization."}><div className="civitas-workspace-stack"><FilterBar searchLabel="Search roles" placeholder="Search by role name or display name" searchValue={query} onSearchChange={setQuery} onReset={() => setQuery("")} />{pageMessage ? <p className="text-sm font-semibold text-muted-strong" role="status">{pageMessage}</p> : null}<RoleNamesTable rows={rows} surface={surface} organizationId={roleNames?.organizationId || organizationId} onEdit={(row, button) => open(row, button)} onReset={(row, button) => open(row, button, true)} /><RoleNameEditorDrawer row={selectedRow} surface={surface} organizationName={organizationName} value={value} message={message} saving={saving} resetConfirmation={resetConfirmation} onValueChange={(next) => { setValue(next); setMessage(""); }} onSave={() => void save(false)} onReset={() => { setResetConfirmation(true); if (resetConfirmation) void save(true); }} onCancel={close} /></div></SectionCard>;
};
