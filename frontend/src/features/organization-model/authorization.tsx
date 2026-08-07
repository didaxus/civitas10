import { createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLogto } from "@logto/react";
import type { OrganizationMappingActionId } from "../../generated/organization-mapping-contracts";
import { DisabledActionButton, type DisabledActionButtonProps } from "../../shared/ui";
import { useOrganizationModelApi, type AuthorizationUiDecision, type OrganizationModelSurface } from "./api";

type DecisionState = { status: AuthorizationUiDecision["status"]; decision?: AuthorizationUiDecision; error?: string; subjectId?: string };
const AuthorizationDecisionContext = createContext<DecisionState>({ status: "loading" });

type ProviderProps = { organizationId: string; actionId: OrganizationMappingActionId; surface?: OrganizationModelSurface; children: ReactNode };

const AuthorizationDecisionProvider = ({ organizationId, subjectId, actionId, surface, children }: ProviderProps & { subjectId: string }) => {
  const api = useOrganizationModelApi(surface);
  const [state, setState] = useState<DecisionState>({ status: "loading" });
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer = 0;
    const refresh = async () => {
      const requestGeneration = ++generation.current;
      setState({ status: "loading" });
      try {
        const decision = await api.resolveAuthorizationDecision(organizationId, subjectId, actionId, controller.signal);
        const exactContext = decision.organizationId === organizationId && decision.subjectId === subjectId && decision.actionId === actionId;
        if (!controller.signal.aborted && requestGeneration === generation.current && exactContext) setState({ status: decision.status, decision, subjectId });
      } catch (error) {
        if (!controller.signal.aborted && requestGeneration === generation.current) setState({ status: "unavailable", error: error instanceof Error ? error.message : "authorization_unavailable" });
      }
    };
    const revalidate = () => { if (document.visibilityState === "visible" && !controller.signal.aborted) void refresh(); };
    void refresh();
    timer = window.setInterval(revalidate, 15000);
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener("civitas:authorization-context-changed", revalidate);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", revalidate); document.removeEventListener("visibilitychange", revalidate); window.removeEventListener("civitas:authorization-context-changed", revalidate); };
  }, [actionId, api, organizationId, subjectId]);
  return <AuthorizationDecisionContext.Provider value={state}>{children}</AuthorizationDecisionContext.Provider>;
};

export const OrganizationModelAuthorizationProvider = ({ organizationId, actionId, surface, children }: ProviderProps) => {
  const { getIdTokenClaims, isAuthenticated } = useLogto();
  const [identity, setIdentity] = useState<{ subjectId?: string; generation: number }>({ generation: 0 });
  useEffect(() => {
    const controller = new AbortController();
    const resolveSubject = async () => {
      setIdentity(value => ({ generation: value.generation + 1 }));
      if (!isAuthenticated) return;
      const claims = await getIdTokenClaims();
      if (!controller.signal.aborted) setIdentity(value => ({ subjectId: String(claims?.sub || "") || undefined, generation: value.generation }));
    };
    const invalidate = () => { if (!controller.signal.aborted) void resolveSubject(); };
    void resolveSubject();
    window.addEventListener("civitas:authorization-context-changed", invalidate);
    return () => { controller.abort(); window.removeEventListener("civitas:authorization-context-changed", invalidate); };
  }, [getIdTokenClaims, isAuthenticated, organizationId, actionId, surface]);
  const boundaryKey = `${surface || "inherited"}:${organizationId}:${identity.subjectId || "unresolved"}:${actionId}:${identity.generation}`;
  if (!identity.subjectId) return <AuthorizationDecisionContext.Provider value={{ status: "loading" }}>{children}</AuthorizationDecisionContext.Provider>;
  return <AuthorizationDecisionProvider key={boundaryKey} organizationId={organizationId} subjectId={identity.subjectId} actionId={actionId} surface={surface}>{children}</AuthorizationDecisionProvider>;
};

export const useAuthorizationDecision = () => useContext(AuthorizationDecisionContext);
type AuthorizationResolution =
  | { treatment: "hide"; render: false; executable: false; queryable: false; diagnostics: false }
  | { treatment: "disable" | "block"; render: true; executable: false; queryable: false; diagnostics: false }
  | { treatment: "filter"; render: true; executable: false; queryable: true; diagnostics: false }
  | { treatment: "explain"; render: true; executable: true; queryable: true; diagnostics: boolean };

const blocked = (): AuthorizationResolution => ({ treatment: "block", render: true, executable: false, queryable: false, diagnostics: false });

/** The sole fail-closed interpreter for authorization decision envelopes. */
export function resolveAuthorizationTreatment(decision: AuthorizationUiDecision | undefined, diagnosticsAllowed = false): AuthorizationResolution {
  if (!decision) return blocked();
  switch (decision.status) {
    case "loading": case "stale": case "unavailable": return blocked();
    case "ready": break;
    default: return blocked();
  }
  switch (decision.finalDecision) {
    case "unresolved": return blocked();
    case "deny":
      if (decision.dataAccessMode !== "none" || decision.scopeAppliedByBackend) return blocked();
      switch (decision.treatment) {
        case "hide": return { treatment: "hide", render: false, executable: false, queryable: false, diagnostics: false };
        case "disable": return { treatment: "disable", render: true, executable: false, queryable: false, diagnostics: false };
        case "block": return blocked();
        case "filter": case "explain": return blocked();
        default: return blocked();
      }
    case "allow":
      switch (decision.treatment) {
        case "filter":
          return decision.dataAccessMode === "scoped" && decision.scopeAppliedByBackend
            ? { treatment: "filter", render: true, executable: false, queryable: true, diagnostics: false }
            : blocked();
        case "explain":
          return (decision.dataAccessMode === "full" && !decision.scopeAppliedByBackend) || (decision.dataAccessMode === "scoped" && decision.scopeAppliedByBackend)
            ? { treatment: "explain", render: true, executable: true, queryable: true, diagnostics: diagnosticsAllowed }
            : blocked();
        case "hide": case "disable": case "block": return blocked();
        default: return blocked();
      }
    default: return blocked();
  }
}

export function useAuthorizedQuery<T>(queryKey: readonly unknown[], load: (signal: AbortSignal) => Promise<T>, enabled = true) {
  const authorization = useAuthorizationDecision();
  type QueryState = { key?: string; loading: boolean; data?: T; error?: string };
  const [state, setState] = useState<QueryState>({ key: "", loading: false });
  const requestGeneration = useRef(0);
  const decision = authorization.decision;
  const stableKey = useMemo(() => JSON.stringify([decision?.organizationId, decision?.subjectId, decision?.policyVersion, decision?.scopeVersion, decision?.actionId, decision?.authorizationSnapshotVersion, queryKey]), [decision?.actionId, decision?.authorizationSnapshotVersion, decision?.organizationId, decision?.policyVersion, decision?.scopeVersion, decision?.subjectId, queryKey]);
  useLayoutEffect(() => {
    const generation = ++requestGeneration.current;
    const decision = authorization.decision;
    if (!enabled || !resolveAuthorizationTreatment(decision).queryable) { setState({ key: stableKey, loading: false }); return; }
    const controller = new AbortController();
    setState({ key: stableKey, loading: true });
    void load(controller.signal).then((data) => { if (!controller.signal.aborted && generation === requestGeneration.current) setState({ key: stableKey, loading: false, data }); }).catch((error: unknown) => { if (!controller.signal.aborted && generation === requestGeneration.current) setState({ key: stableKey, loading: false, error: error instanceof Error ? error.message : "request_unavailable" }); });
    return () => controller.abort();
  }, [authorization.decision, authorization.status, enabled, load, stableKey]);
  return state.key === stableKey ? state : ({ loading: false } satisfies QueryState);
}

export function useAuthorizedMutation<TInput, TResult>(mutate: (input: TInput, signal: AbortSignal) => Promise<TResult>) {
  const authorization = useAuthorizationDecision();
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); }, [authorization.status, authorization.decision?.organizationId, authorization.decision?.subjectId, authorization.decision?.authorizationSnapshotVersion]);
  return useCallback(async (input: TInput) => {
    if (!resolveAuthorizationTreatment(authorization.decision).executable) throw new Error(authorization.decision?.terminalReasonCode || "authorization_not_ready");
    active.current?.abort();
    const controller = new AbortController(); active.current = controller;
    try { return await mutate(input, controller.signal); } finally { if (active.current === controller) active.current = null; }
  }, [authorization.decision, authorization.status, mutate]);
}

export const AuthorizationBlockState = ({ state }: { state: DecisionState }) => <section role="status" aria-live="polite" className="rounded-lg border border-border bg-surface p-6"><h2 className="font-semibold">{state.status === "loading" ? "Checking authorization" : state.decision?.treatment === "disable" ? "Action currently disabled" : "Authorization unavailable"}</h2><p className="mt-2 text-sm text-muted">{state.status === "loading" ? "Checking the current subject, organization, policy, scope, snapshot, and runtime state…" : state.decision?.remediation?.safeMessage || state.decision?.terminalReasonCode || state.error || "Protected organization data is not available until authorization is current."}</p></section>;
export const AuthorizationBoundary = ({ children }: { children: ReactNode }) => { const state = useAuthorizationDecision(); const resolution = resolveAuthorizationTreatment(state.decision); if (!resolution.render) return null; return resolution.queryable ? children : <AuthorizationBlockState state={state} />; };
export const AuthorizationReason = ({ decision }: { decision: AuthorizationUiDecision }) => <span>{decision.remediation?.safeMessage || decision.terminalReasonCode}</span>;
export const ScopedDataNotice = () => { const { decision } = useAuthorizationDecision(); return decision?.dataAccessMode === "scoped" && decision.scopeAppliedByBackend ? <p role="status" className="text-sm text-muted">Results are scoped by the backend authorization policy.</p> : null; };
const safeActionExplanation = (state: DecisionState) => {
  const category = state.decision?.terminalReasonCode || state.status;
  const remediation = state.decision?.remediation?.safeMessage;
  return remediation ? `Reason: ${category}. ${remediation}` : `Reason: ${category}. This action is unavailable until authorization is current.`;
};

/** Authorization-aware action control. Backend reason category and safe remediation are the only decision details disclosed. */
export const AuthorizationAction = ({ disabled: locallyDisabled = false, disabledReason, ...props }: DisabledActionButtonProps) => {
  const state = useAuthorizationDecision();
  const resolution = resolveAuthorizationTreatment(state.decision);
  if (!resolution.render) return null;
  const authorizationDisabled = !resolution.executable;
  const disabled = authorizationDisabled || locallyDisabled;
  const explanation = authorizationDisabled ? safeActionExplanation(state) : disabledReason;
  return <DisabledActionButton {...props} disabled={disabled} disabledReason={explanation} />;
};
export const AuthorizationDiagnosticsLink = ({ href, diagnosticsAllowed }: { href: string; diagnosticsAllowed: boolean }) => { const { decision } = useAuthorizationDecision(); const resolution = resolveAuthorizationTreatment(decision, diagnosticsAllowed); return resolution.diagnostics && decision ? <a className="text-link underline" href={href}>Inspect authorization decision {decision.decisionId}</a> : null; };
