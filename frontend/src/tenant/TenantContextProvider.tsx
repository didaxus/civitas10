import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { APP_ENV } from "../env";
import type { TenantContext, TenantSessionContextDto } from "./TenantContext";
import { beginTenantContextTransition } from "./lifecycle";

const ResolvedTenantContext = createContext<TenantContext | null>(null);
const contextUrl = `${APP_ENV.api.url.replace(/\/$/, "")}/session/context`;

export const TenantContextProvider = ({ children }: { children: ReactNode }) => {
  const [context, setContext] = useState<TenantContext | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const request = new AbortController();
    beginTenantContextTransition(); setContext(null); setFailed(false);
    void fetch(contextUrl, { credentials: "include", headers: { Accept: "application/json" }, signal: request.signal })
      .then(async (response) => { if (!response.ok) throw new Error("Tenant session context unavailable"); return await response.json() as TenantSessionContextDto; })
      .then(({ tenantContext }) => { if (!request.signal.aborted) setContext(Object.freeze(tenantContext)); })
      .catch(() => { if (!request.signal.aborted) setFailed(true); });
    return () => { request.abort(); beginTenantContextTransition(); };
  }, []);
  if (failed) return <main role="alert">Tenant context could not be resolved for this hostname and session.</main>;
  if (!context) return <main aria-busy="true">Resolving organization context…</main>;
  return <ResolvedTenantContext.Provider value={context}>{children}</ResolvedTenantContext.Provider>;
};
export const useTenantContext = () => { const context = useContext(ResolvedTenantContext); if (!context) throw new Error("TenantContextProvider is required"); return context; };
export const useOptionalTenantContext = () => useContext(ResolvedTenantContext);
