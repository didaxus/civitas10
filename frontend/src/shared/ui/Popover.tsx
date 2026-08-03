import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
export const Popover = ({ trigger, children, label }: { trigger: ReactElement; children: ReactNode; label: string }) => {
  const [open, setOpen] = useState(false); const id = useId(); const root = useRef<HTMLSpanElement>(null); const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => { if (!open) return; const close = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; const key = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } }; document.addEventListener("pointerdown", close); document.addEventListener("keydown", key); return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); }; }, [open]);
  const element = isValidElement(trigger) ? cloneElement(trigger, { ref: (node: HTMLElement | null) => { triggerRef.current = node; }, "aria-expanded": open, "aria-controls": id, onClick: () => setOpen((value) => !value) } as Record<string, unknown>) : trigger;
  return <span className="relative inline-flex" ref={root}>{element}{open ? <span id={id} role="dialog" aria-label={label} className="civitas-popover">{children}</span> : null}</span>;
};
