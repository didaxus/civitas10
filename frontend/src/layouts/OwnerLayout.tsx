import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AppShell } from "./AppShell";
import { buildOwnerNavigationTree, materializeNavigationTree } from "../navigation/materialize-navigation";
import { toShellNavItems } from "../navigation/nav-item-adapter";
import { useOwnerApi } from "../api/owner";
import { isConcreteRouteParam } from "../navigation/route-builders";
import { Outlet, useParams } from "react-router";

type ActiveOrganizationContext = {
  id: string;
  name: string | null;
  status: "loading" | "ready" | "not-found" | "denied" | "error";
};

export const OwnerLayout = ({ children, organizationId }: { children?: ReactNode; organizationId?: string }) => {
  const ownerApi = useOwnerApi();
  const [activeOrganization, setActiveOrganization] = useState<ActiveOrganizationContext | null>(
    organizationId ? { id: organizationId, name: null, status: "loading" } : null,
  );

  useEffect(() => {
    let active = true;
    if (!isConcreteRouteParam(organizationId)) {
      setActiveOrganization(null);
      return () => { active = false; };
    }
    setActiveOrganization({ id: organizationId, name: null, status: "loading" });
    void ownerApi.getOrganizations()
      .then((response) => {
        if (!active) return;
        const organization = (response.organizations || []).find((candidate) => candidate.logtoOrganizationId === organizationId);
        setActiveOrganization({ id: organizationId, name: organization?.name || null, status: organization ? "ready" : "not-found" });
      })
      .catch((caught) => {
        if (!active) return;
        const message = caught instanceof Error ? caught.message.toLowerCase() : "";
        setActiveOrganization({ id: organizationId, name: null, status: message.includes("403") || message.includes("denied") ? "denied" : "error" });
      });
    return () => { active = false; };
  }, [organizationId, ownerApi]);

  const navigation = toShellNavItems(materializeNavigationTree(buildOwnerNavigationTree({ organizationId, organizationName: activeOrganization?.name }), { organizationId }));
  return <AppShell area="owner" organizationId={organizationId} organizationName={activeOrganization?.name} navItems={navigation}>{children ?? <Outlet />}</AppShell>;
};

export const OwnerOrganizationLayout = () => {
  const { organizationId = "" } = useParams();
  return <OwnerLayout organizationId={organizationId} />;
};
