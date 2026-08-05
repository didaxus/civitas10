import { IconX } from "@tabler/icons-react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

type FormDrawerProps = {
  open: boolean;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  preventClose?: boolean;
};

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const FormDrawer = ({ open, eyebrow, title, description, children, actions, onClose, closeLabel = "Close drawer", initialFocusRef, preventClose = false }: FormDrawerProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTarget = initialFocusRef?.current || drawerRef.current?.querySelector<HTMLElement>(focusableSelector) || drawerRef.current;
    window.requestAnimationFrame(() => focusTarget?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!preventClose) onClose();
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusableElements = [...drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!focusableElements.length) return;
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [initialFocusRef, onClose, open, preventClose]);

  if (!open) return null;
  return (
    <div className="civitas-form-drawer-overlay" data-civitas-overlay="form-drawer" onMouseDown={(event) => { if (!preventClose && event.target === event.currentTarget) onClose(); }}>
      <aside ref={drawerRef} className="civitas-form-drawer" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} data-civitas-pattern="form-drawer" tabIndex={-1}>
        <header className="civitas-form-drawer-header">
          <div>
            {eyebrow ? <p className="civitas-eyebrow">{eyebrow}</p> : null}
            <h2 id={titleId} className="civitas-card-title">{title}</h2>
            {description ? <p id={descriptionId} className="civitas-card-description">{description}</p> : null}
          </div>
          <button type="button" className="civitas-icon-button" aria-label={closeLabel} title={closeLabel} onClick={onClose} disabled={preventClose}>
            <IconX aria-hidden="true" size={20} stroke={1.8} />
          </button>
        </header>
        <div className="civitas-form-drawer-body">{children}</div>
        {actions ? <footer className="civitas-form-drawer-footer">{actions}</footer> : null}
      </aside>
    </div>
  );
};
