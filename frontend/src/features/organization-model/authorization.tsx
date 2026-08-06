import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLogto } from "@logto/react";
import type { OrganizationMappingActionId } from "../../generated/organization-mapping-contracts";
import { useOrganizationModelApi, type AuthorizationUiDecision } from "./api";

type DecisionState = { status: AuthorizationUiDecision["status"]; decision?: AuthorizationUiDecision; error?: string; subjectId?: string };
const AuthorizationDecisionContext = createContext<DecisionState>({ status: "loading" });

export const OrganizationModelAuthorizationProvider = ({ organizationId, actionId, children }: { organizationId: string; actionId: OrganizationMappingActionId; children: ReactNode }) => {
  const api = useOrganizationModelApi();
  const { getIdTokenClaims, isAuthenticated } = useLogto();
  const [state, setState] = useState<DecisionState>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const refresh = async () => {
      setState({ status: "loading" });
      try {
        if (!isAuthenticated) throw new Error("authentication_required");
        const claims = await getIdTokenClaims();
        const subjectId = String(claims?.sub || "");
        if (!subjectId) throw new Error("authorization_subject_unavailable");
        const decision = await api.resolveAuthorizationDecision(organizationId, subjectId, actionId, controller.signal);
        if (!controller.signal.aborted) setState({ status: decision.status, decision, subjectId });
      } catch (error) {
        if (!controller.signal.aborted) setState({ status: "unavailable", error: error instanceof Error ? error.message : "authorization_unavailable" });
      }
    };
    const revalidate = () => { if (document.visibilityState === "visible" && !controller.signal.aborted) void refresh(); };
    void refresh();
    timer = window.setInterval(revalidate, 15000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("civitas:authorization-context-changed", revalidate);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); window.removeEventListener("civitas:authorization-context-changed", revalidate); };
  }, [actionId, api, getIdTokenClaims, isAuthenticated, organizationId]);
  return <AuthorizationDecisionContext.Provider key={`${organizationId}:${actionId}:${state.subjectId || "unresolved"}`} value={state}>{children}</AuthorizationDecisionContext.Provider>;
};

export const useAuthorizationDecision = () => useContext(AuthorizationDecisionContext);
export const resolveAuthorizationTreatment = (decision: AuthorizationUiDecision | undefined, diagnosticsAllowed = false) => {
  if (!decision || decision.status !== "ready" || decision.finalDecision === "unresolved") return "block" as const;
  if (decision.treatment === "explain" && !diagnosticsAllowed) return decision.finalDecision === "allow" ? "filter" as const : "block" as const;
  return decision.treatment;
};

export function useAuthorizedQuery<T>(queryKey: readonly unknown[], load: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const authorization = useAuthorizationDecision();
  const [state, setState] = useState<{ loading: boolean; data?: T; error?: string }>({ loading: false });
  const stableKey = JSON.stringify(queryKey);
  useEffect(() => {
    const decision = authorization.decision;
    if (!enabled || authorization.status !== "ready" || decision?.finalDecision !== "allow") { setState({ loading: false }); return; }
    const controller = new AbortController();
    setState({ loading: true });
    void load(controller.signal).then((data) => { if (!controller.signal.aborted) setState({ loading: false, data }); }).catch((error: unknown) => { if (!controller.signal.aborted) setState({ loading: false, error: error instanceof Error ? error.message : "request_unavailable" }); });
    return () => controller.abort();
  }, [authorization.decision, authorization.status, enabled, load, stableKey]);
  return state;
}

export function useAuthorizedMutation<TInput, TResult>(mutate: (input: TInput, signal: AbortSignal) => Promise<TResult>) {
  const authorization = useAuthorizationDecision();
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, [authorization.status, authorization.decision?.organizationId, authorization.decision?.subjectId, authorization.decision?.authorizationSnapshotVersion]);
  return useCallback(async (input: TInput) => {
    if (authorization.status !== "ready" || authorization.decision?.finalDecision !== "allow") throw new Error(authorization.decision?.terminalReasonCode || "authorization_not_ready");
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    try { return await mutate(input, controller.signal); } finally { if (active.current === controller) active.current = null; }
  }, [authorization.decision, authorization.status, mutate]);
}

export const AuthorizationBlockState = ({ state }: { state: DecisionState }) => <section role="status" aria-live="polite" className="rounded-lg border border-border bg-surface p-6"><h2 className="font-semibold">{state.status === "loading" ? "Checking authorization" : state.decision?.treatment === "disable" ? "Action currently disabled" : "Authorization unavailable"}</h2><p className="mt-2 text-sm text-muted">{state.status === "loading" ? "Checking the current subject, organization, policy, scope, snapshot, and runtime state…" : state.decision?.remediation?.safeMessage || state.decision?.terminalReasonCode || state.error || "Protected organization data is not available until authorization is current."}</p></section>;
export const AuthorizationBoundary = ({ children }: { children: ReactNode }) => { const state = useAuthorizationDecision(); if (state.status === "ready" && state.decision?.treatment === "hide") return null; return state.status === "ready" && state.decision?.finalDecision === "allow" ? children : <AuthorizationBlockState state={state} />; };
export const AuthorizationReason = ({ decision }: { decision: AuthorizationUiDecision }) => <span>{decision.remediation?.safeMessage || decision.terminalReasonCode}</span>;
export const ScopedDataNotice = () => { const { decision } = useAuthorizationDecision(); return decision?.dataAccessMode === "scoped" && decision.scopeAppliedByBackend ? <p role="status" className="text-sm text-muted">Results are scoped by the backend authorization policy.</p> : null; };
export const AuthorizationAction = ({ children }: { children: (disabled: boolean, reason?: string) => ReactNode }) => { const state = useAuthorizationDecision(); if (state.status === "ready" && state.decision?.treatment === "hide") return null; const disabled = state.status !== "ready" || state.decision?.finalDecision !== "allow"; return <>{children(disabled, disabled ? state.decision?.remediation?.safeMessage || state.decision?.terminalReasonCode || state.status : undefined)}</>; };
export const AuthorizationDiagnosticsLink = ({ href, diagnosticsAllowed }: { href: string; diagnosticsAllowed: boolean }) => { const { decision } = useAuthorizationDecision(); return diagnosticsAllowed && decision?.treatment === "explain" ? <a className="text-link underline" href={href}>Inspect authorization decision {decision.decisionId}</a> : null; };
