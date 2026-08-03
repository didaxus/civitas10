import { forwardRef, type MouseEventHandler } from "react";
export type SwitchProps = { checked: boolean; disabled?: boolean; busy?: boolean; label: string; onCheckedChange?: (checked: boolean) => void; visualState?: "on" | "off" | "mixed" | "locked"; onClick?: MouseEventHandler<HTMLButtonElement> };
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(({ checked, disabled = false, busy = false, label, onCheckedChange, visualState, onClick }, ref) => {
  const state = visualState ?? (checked ? "on" : "off"); const locked = state === "locked";
  return <button ref={ref} type="button" role="switch" aria-checked={checked} aria-label={label} aria-disabled={disabled || locked || undefined} aria-busy={busy || undefined} disabled={disabled} className="civitas-switch" data-state={state} onClick={(event) => { onClick?.(event); if (!disabled && !busy && !locked) onCheckedChange?.(!checked); }}><span className="civitas-switch-thumb" aria-hidden="true" /></button>;
});
Switch.displayName = "Switch";
