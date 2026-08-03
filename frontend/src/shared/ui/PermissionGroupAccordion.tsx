import { useId, useState } from "react";

export type PermissionToggleRow = {
  permissionId: string;
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  availabilityMessage?: string;
  reason?: string;
};

export const PermissionGroupAccordion = ({ domain, rows, expanded, activeCount, totalCount, roleLabel, onExpandedChange, onTogglePermission, onToggleGroup, disabled = false }: {
  domain: string;
  rows: PermissionToggleRow[];
  expanded: boolean;
  activeCount: number;
  totalCount: number;
  roleLabel: string;
  onExpandedChange: (expanded: boolean) => void;
  onTogglePermission: (permissionId: string, checked: boolean) => void;
  onToggleGroup: (checked: boolean) => void;
  disabled?: boolean;
}) => {
  const panelId = useId();
  const [openAvailability, setOpenAvailability] = useState<string | null>(null);
  const eligibleRows = rows.filter((row) => !row.disabled);
  const enabledEligibleCount = eligibleRows.filter((row) => row.checked).length;
  const groupState = eligibleRows.length === 0 ? "Unavailable" : activeCount === totalCount ? "All enabled" : activeCount === 0 ? "None enabled" : "Some enabled";
  const enableAll = enabledEligibleCount < eligibleRows.length;
  return (
    <section className="civitas-card civitas-card-flush" data-civitas-primitive="permission-group-accordion">
      <div className="civitas-card-header">
        <button type="button" className="civitas-button civitas-permission-group-summary" aria-expanded={expanded} aria-controls={panelId} onClick={() => onExpandedChange(!expanded)}>
          <span aria-hidden="true">{expanded ? "⌃" : "⌄"}</span><span>{domain}</span>
        </button>
        <div className="inline-flex flex-wrap items-center gap-3 text-xs font-semibold text-muted-strong">
          <span>{activeCount} of {totalCount} enabled</span><span>{groupState}</span>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" aria-label={`${enableAll ? "Enable" : "Disable"} all permissions in ${domain} for ${roleLabel}`} checked={!enableAll} disabled={disabled || eligibleRows.length === 0} onChange={() => onToggleGroup(enableAll)} />
            <span>{enableAll ? "Enable all permissions in this group" : "Disable all permissions in this group"}</span>
          </label>
        </div>
      </div>
      {expanded ? <div id={panelId} className="civitas-list-stack">
        <div className="hidden md:grid civitas-list-row text-xs font-semibold uppercase tracking-wide text-muted" style={{ gridTemplateColumns: "minmax(12rem,1fr) minmax(16rem,2fr) minmax(8rem,auto)" }}>
          <span>Permission</span><span>Description</span><span>Control</span>
        </div>
        {rows.map((row) => {
          const popoverId = `${panelId}-${row.permissionId.replace(/[^a-z0-9]+/gi, "-")}`;
          const popoverOpen = openAvailability === row.permissionId;
          return <div key={row.permissionId} className="civitas-list-row md:grid md:items-center md:gap-4" style={{ gridTemplateColumns: "minmax(12rem,1fr) minmax(16rem,2fr) minmax(8rem,auto)" }}>
            <span className="min-w-0 font-semibold">{row.label}</span>
            <span className="text-sm text-muted-strong">{row.description || ""}</span>
            <span className="relative inline-flex items-center justify-end gap-2">
              {row.disabled && row.availabilityMessage ? <><button type="button" className="civitas-secondary-button" aria-expanded={popoverOpen} aria-controls={popoverId} onClick={() => setOpenAvailability(popoverOpen ? null : row.permissionId)}>Why unavailable?</button>{popoverOpen ? <span id={popoverId} role="status" className="civitas-card civitas-pad-tight absolute right-0 top-full z-10 mt-2 w-64 text-sm text-muted-strong">{row.availabilityMessage}</span> : null}</> : null}
              <label className="inline-flex items-center gap-2"><span className="sr-only">Set {row.label} for {roleLabel}</span><input type="checkbox" checked={row.checked} disabled={disabled || row.disabled || row.loading} onChange={(event) => onTogglePermission(row.permissionId, event.target.checked)} /></label>
            </span>
          </div>;
        })}
      </div> : null}
    </section>
  );
};
