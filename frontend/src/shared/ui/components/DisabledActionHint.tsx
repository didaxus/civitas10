import type { ReactNode } from "react";
export type DisabledActionHintProps = { children?: ReactNode; message?: string };
export const DisabledActionHint = ({ children, message }: DisabledActionHintProps) => <span className="civitas-muted">{children || message}</span>;
export const useDisabledActionHint = (message?: string) => ({ message, describedBy: undefined });
