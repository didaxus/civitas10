import { useId, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";

export type DisabledActionHintProps = { children?: ReactNode; message?: string; id?: string };

/** Persistent text that can be referenced by a disabled control. */
export const DisabledActionHint = ({ children, message, id }: DisabledActionHintProps) => (
  <span id={id} className="civitas-muted mt-1 block text-sm text-muted">
    {children || message}
  </span>
);

export const useDisabledActionHint = (message?: string) => {
  const id = useId();
  return { message, describedBy: message ? id : undefined };
};

export type DisabledActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & {
  disabled?: boolean;
  /** A safe, user-facing explanation. It is persistently rendered when the action is unavailable. */
  disabledReason?: ReactNode;
  /** Use native disabled semantics only when the explanation does not need to be focus-discoverable. */
  focusableWhenDisabled?: boolean;
};

/**
 * A button whose unavailable state is both focusable and explained by default.
 * aria-disabled preserves keyboard focus; invocation is suppressed for mouse,
 * keyboard, and form-submit activation.
 */
export const DisabledActionButton = ({
  disabled = false,
  disabledReason,
  focusableWhenDisabled = true,
  onClick,
  onKeyDown,
  className,
  type = "button",
  children,
  ...props
}: DisabledActionButtonProps) => {
  const hintId = useId();
  const explained = disabled && Boolean(disabledReason);
  const ariaDisabled = disabled && focusableWhenDisabled;
  const describedBy = [props["aria-describedby"], explained ? hintId : undefined].filter(Boolean).join(" ") || undefined;
  const preventDisabledClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (ariaDisabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <span className="inline-flex flex-col items-start">
      <button
        {...props}
        className={`${className || ""}${ariaDisabled ? " cursor-not-allowed opacity-50" : ""}`}
        type={type}
        disabled={disabled && !focusableWhenDisabled}
        aria-disabled={ariaDisabled || undefined}
        aria-describedby={describedBy}
        onClick={preventDisabledClick}
        onKeyDown={(event) => {
          if (ariaDisabled && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onKeyDown?.(event);
        }}
      >
        {children}
      </button>
      {explained ? <DisabledActionHint id={hintId}>{disabledReason}</DisabledActionHint> : null}
    </span>
  );
};
