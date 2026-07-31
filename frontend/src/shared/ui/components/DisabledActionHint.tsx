import { ReactNode } from "react";

export type DisabledActionHintProps = {
  /** Icon or visual indicator (optional) */
  icon?: ReactNode;
  /** Short title explaining why action is disabled */
  title: string;
  /** Detailed explanation of requirements/permissions needed */
  description: string;
  /** Optional link to documentation or access request */
  learnMoreLink?: {
    href: string;
    label: string;
  };
  /** Optional list of missing permissions */
  missingPermissions?: string[];
};

/**
 * Reusable component to explain why an action/button is disabled.
 * Replaces cryptic `title="..."` tooltips with clear, actionable messaging.
 * 
 * @example
 * ```tsx
 * <DisabledActionHint
 *   title="Requiere permiso de owner"
 *   description="Solo los usuarios con rol owner pueden crear unidades organizacionales."
 *   learnMoreLink={{ href: "/docs/permissions", label: "Ver documentación de permisos" }}
 * />
 * ```
 */
export const DisabledActionHint = ({
  icon,
  title,
  description,
  learnMoreLink,
  missingPermissions,
}: DisabledActionHintProps) => {
  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-surface-subtle border border-border-subtle">
      {icon && (
        <div className="flex-shrink-0 text-muted mt-0.5">
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className="text-sm font-medium text-strong">{title}</p>
        <p className="text-xs text-muted-strong">{description}</p>
        
        {missingPermissions && missingPermissions.length > 0 && (
          <div className="pt-1">
            <p className="text-xs text-muted mb-1">Permisos requeridos:</p>
            <ul className="list-disc list-inside text-xs text-muted space-y-0.5">
              {missingPermissions.map((perm) => (
                <li key={perm} className="font-mono">{perm}</li>
              ))}
            </ul>
          </div>
        )}
        
        {learnMoreLink && (
          <a
            href={learnMoreLink.href}
            className="inline-block pt-1 text-xs text-primary-strong hover:text-primary-dimmed transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            {learnMoreLink.label} →
          </a>
        )}
      </div>
    </div>
  );
};

/**
 * Hook-friendly wrapper for disabled action hints.
 * Use this when you need conditional rendering based on permissions.
 */
export const useDisabledActionHint = (props: Omit<DisabledActionHintProps, 'icon'>) => {
  return {
    disabled: true,
    hint: <DisabledActionHint {...props} />,
  };
};
