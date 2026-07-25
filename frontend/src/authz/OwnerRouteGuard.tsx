import { useLogto } from "@logto/react";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { getMe, type MeResponse } from "../api/me";
import { APP_ENV } from "../env";
import { getMissingOwnerShellScopes, OWNER_GLOBAL_ROLE, OWNER_SHELL_REQUIRED_SCOPES, ownerHasGlobalRole } from "./ownerScopes";
import { getAccessTokenDiagnostics } from "../api/base";
import { VisualAuthorizationProvider, visualAuthorizationContextFromOwnerMe } from "../authorization/components/VisualAuthorizationProvider";

type OwnerTokenDiagnostics = ReturnType<typeof getAccessTokenDiagnostics>;

type OwnerRouteGuardState =
  | { status: "loading" }
  | { status: "authorized"; me: MeResponse }
  | { status: "denied"; reason: "authentication" | "global-role" | "global-scopes" | "token"; message: string; missingScopes?: string[]; tokenDiagnostics?: OwnerTokenDiagnostics }
  | { status: "api-unavailable"; title: "API unavailable" | "Proxy routing error" | "Unexpected non-JSON response"; message: string };

function classifyApiStartupError(error: unknown): OwnerRouteGuardState | null {
  if (!(error instanceof Error)) return null;
  const message = error.message;
  if (/API_NON_JSON_RESPONSE|non-JSON response|Content-Type: text\/html|<!doctype html/i.test(message)) {
    return { status: "api-unavailable", title: /text\/html|<!doctype html/i.test(message) ? "Proxy routing error" : "Unexpected non-JSON response", message };
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) return { status: "api-unavailable", title: "API unavailable", message };
  return null;
}

export function OwnerRouteGuard({ children }: { children: ReactNode }) {
  const { isAuthenticated, getAccessToken } = useLogto();
  const { organizationId } = useParams();
  const [state, setState] = useState<OwnerRouteGuardState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    async function validateOwnerAccess() {
      setState({ status: "loading" });
      if (!isAuthenticated) {
        setState({ status: "denied", reason: "authentication", message: "Access denied" });
        return;
      }
      try {
        const token = await getAccessToken(APP_ENV.api.resource);
        if (!token) throw new Error("No API access token was returned for the Civitas API resource.");
        const tokenDiagnostics = getAccessTokenDiagnostics(token);
        const me = await getMe(token);
        if (!active) return;
        if (!ownerHasGlobalRole(me)) {
          setState({ status: "denied", reason: "global-role", message: `403 / Access denied: missing required global role ${OWNER_GLOBAL_ROLE}.` });
          return;
        }
        const missingScopes = getMissingOwnerShellScopes(me);
        if (missingScopes.length > 0) {
          const receivedCanonicalApiPermission = (me.auth?.scopes ?? []).some((scope) => OWNER_SHELL_REQUIRED_SCOPES.includes(scope));
          setState({
            status: "denied",
            reason: "global-scopes",
            message: receivedCanonicalApiPermission
              ? "403 / Access denied: missing required global API permissions. Sign out and sign in again to refresh owner consent if your role was recently updated."
              : "No se recibió un permiso API canónico en el token. Cierra sesión e inicia sesión después de asignar los permisos canónicos al rol.",
            missingScopes,
            tokenDiagnostics,
          });
          return;
        }
        setState({ status: "authorized", me });
      } catch (error) {
        if (!active) return;
        setState(classifyApiStartupError(error) || { status: "denied", reason: "token", message: error instanceof Error ? `403 / Access denied: ${error.message}` : "403 / Access denied" });
      }
    }
    validateOwnerAccess();
    return () => { active = false; };
  }, [getAccessToken, isAuthenticated]);

  if (state.status === "loading") return <div className="p-6 text-sm text-muted-strong">Validando permisos...</div>;
  if (state.status === "api-unavailable") return <div className="p-6"><h1 className="text-2xl font-semibold text-text">{state.title}</h1><p className="mt-2 text-sm text-muted-strong">{state.message}</p></div>;
  if (state.status === "denied") return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-text">403 / Access denied</h1>
      <p className="mt-2 text-sm text-muted-strong">{state.message}</p>
      {state.reason === "global-scopes" && state.missingScopes?.length ? <p className="mt-2 text-sm text-muted-strong">Missing global scopes: {state.missingScopes.join(", ")}</p> : null}
      {state.reason === "global-scopes" && state.tokenDiagnostics ? <p className="mt-2 text-xs text-muted">Token audience: {JSON.stringify(state.tokenDiagnostics.aud)} · Token scope: {state.tokenDiagnostics.scope || "(empty)"}</p> : null}
    </div>
  );
  return <VisualAuthorizationProvider value={visualAuthorizationContextFromOwnerMe(state.me, organizationId)}>{children}</VisualAuthorizationProvider>;
}
