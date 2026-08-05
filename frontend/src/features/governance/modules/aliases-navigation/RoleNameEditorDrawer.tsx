import { useRef } from "react";
import { AlertStrip, FormDrawer, FormField } from "../../../../shared/ui";
import type { GovernanceRoleNameRow, GovernanceSurface } from "../../contracts";
import { displayNameForSurface, modifiedAt, modifiedBy, roleNameForSurface } from "./roleNamesViewModel";

export const RoleNameEditorDrawer = ({ row, surface, organizationName, value, message, saving, resetConfirmation, onValueChange, onSave, onReset, onCancel }: { row: GovernanceRoleNameRow | null; surface: GovernanceSurface; organizationName?: string | null; value: string; message: string; saving: boolean; resetConfirmation: boolean; onValueChange: (value: string) => void; onSave: () => void; onReset: () => void; onCancel: () => void }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  if (!row) return null;
  const owner = surface === "owner";
  const roleName = roleNameForSurface(row, surface);
  const currentDisplayName = displayNameForSurface(row, surface);
  return <FormDrawer open={Boolean(row)} eyebrow="ROLE NAME" title="Edit display name" description="Display names change presentation only. Permissions and access remain unchanged." onClose={onCancel} closeLabel="Close display name editor" initialFocusRef={inputRef} preventClose={saving} actions={<><button className="civitas-secondary-button" type="button" onClick={onReset} disabled={saving}>{resetConfirmation ? "Confirm reset" : "Reset"}</button><button className="civitas-secondary-button" type="button" onClick={onCancel} disabled={saving}>Cancel</button><button className="civitas-primary-button" type="button" onClick={onSave} disabled={saving || resetConfirmation}>{saving ? "Saving..." : "Save"}</button></>}>
    <div className="civitas-workspace-stack">
      {resetConfirmation ? <AlertStrip variant="warning" title="Reset display name">Reset removes the custom display name for this scope. The inherited display name will be shown after saving.</AlertStrip> : <AlertStrip variant="info">Display names change presentation only. Permissions and access remain unchanged.</AlertStrip>}
      <dl className="grid gap-3 sm:grid-cols-2">
        <div><dt className="text-sm font-semibold text-muted-strong">Role name</dt><dd>{roleName}</dd></div>
        <div><dt className="text-sm font-semibold text-muted-strong">Scope</dt><dd>{owner ? "Across Civitas" : organizationName || "This organization"}</dd></div>
        <div><dt className="text-sm font-semibold text-muted-strong">Current display name</dt><dd>{currentDisplayName}</dd></div>
        <div><dt className="text-sm font-semibold text-muted-strong">Last modified</dt><dd>{modifiedAt(row)}</dd></div>
        <div><dt className="text-sm font-semibold text-muted-strong">Modified by</dt><dd>{modifiedBy(row)}</dd></div>
      </dl>
      <FormField id="role-label-input" label="Display name" hint={owner ? "Used across Civitas unless an organization has its own display name." : "Shown only in this organization."} error={message || undefined}>
        <input ref={inputRef} id="role-label-input" className="civitas-field" value={value} maxLength={80} aria-invalid={Boolean(message)} onChange={(event) => onValueChange(event.target.value)} disabled={saving || resetConfirmation} />
      </FormField>
      <div className="text-xs text-muted-strong">{value.normalize("NFKC").trim().length}/80 characters</div>
    </div>
  </FormDrawer>;
};
