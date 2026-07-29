import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useLogto } from "@logto/react";
import type { Icon } from "@tabler/icons-react";
import {
  IconArrowLeft,
  IconMenu2,
} from "@tabler/icons-react";
import civitasLogoFullDark from "../assets/brand/civitas-logo-full-dark.svg";
import { APP_ENV } from "../env";
import { appRoutes } from "../navigation/routes";
import { useBreakpoint } from "../shared/hooks";
import { NavCollapse } from "../shared/ui";
import { SignOutActionButton } from "../components/layout/TopBar/ActionButtons";

export type ShellArea = "public" | "owner" | "organization-admin" | "organization-member";

export type NavItem = { label: string; path?: string; icon: Icon; match?: (pathname: string) => boolean; level?: number; children?: NavItem[] };

type AppShellProps = {
  area: ShellArea;
  children: ReactNode;
  navItems?: NavItem[];
  organizationId?: string;
  showBackButton?: boolean;
  actions?: ReactNode;
};

const areaLabel: Record<ShellArea, string> = {
  public: "Public visitor",
  owner: "Owner global",
  "organization-admin": "Organization admin",
  "organization-member": "Organization member",
};

const resolveNavItems = (area: ShellArea, organizationId?: string, navItems?: NavItem[]) => {
  if (navItems?.length) return navItems;
  if (area === "public") return [];
  return [{
    label: "Resolved navigation is required",
    path: undefined,
    icon: IconMenu2,
    match: () => false,
    children: organizationId ? [{ label: `Context: ${organizationId}`, icon: IconMenu2 }] : undefined,
  }];
};

export const AppShell = ({ area, children, navItems, organizationId, showBackButton = false, actions }: AppShellProps) => {
  const navigate = useNavigate();
  const { signOut } = useLogto();
  const isMobile = useBreakpoint("md");
  const [mobileOpen, setMobileOpen] = useState(false);
  const resolvedNavItems = resolveNavItems(area, organizationId, navItems);
  const homePath = area === "public" ? "/" : appRoutes.owner.path;
  const sidebarState = "expanded";
  const mobileState = mobileOpen ? "mobile-open" : "mobile-closed";

  useEffect(() => {
    if (!isMobile) setMobileOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [mobileOpen]);

  return (
    <div
      className={`civitas-shell civitas-shell-${area}`}
      data-civitas-shell="true"
      data-civitas-area={area}
      data-civitas-sidebar-state={sidebarState}
      data-civitas-sidebar-mobile-open={mobileOpen}
      data-civitas-sidebar-mobile-state={mobileState}
    >
      {isMobile && mobileOpen ? <button type="button" className="civitas-sidebar-backdrop" aria-label="Close Civitas navigation" onClick={() => setMobileOpen(false)} /> : null}
      <aside className="civitas-sidebar" aria-label={`${areaLabel[area]} sidebar`} data-mobile-open={mobileOpen}>
        <div className="civitas-sidebar-header civitas-sidebar-brand-row">
          <Link to={homePath} className="civitas-sidebar-brand" aria-label="Civitas home">
            <img src={civitasLogoFullDark} alt="Civitas" className="civitas-brand-logo" />
          </Link>
        </div>
        {resolvedNavItems[0]?.label === "Resolved navigation is required" ? <div className="civitas-nav-link" data-navigation-contract="navigation-required-but-empty">Resolved navigation is required for this shell area.</div> : <NavCollapse items={resolvedNavItems} label={areaLabel[area]} onNavigate={() => setMobileOpen(false)} />}
      </aside>
      <div className="civitas-shell-content">
        <header className="civitas-topbar">
          <div className="civitas-topbar-inner">
            <div className="civitas-topbar-left civitas-cluster">
              {isMobile ? <button type="button" className="civitas-secondary-button civitas-icon-button civitas-mobile-menu-button" aria-label="Abrir menú" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)}><IconMenu2 size={18} /><span className="civitas-icon-button-label">Menu</span></button> : null}
              {showBackButton ? <button type="button" onClick={() => navigate(-1)} className="civitas-secondary-button"><IconArrowLeft size={18} />Back</button> : null}
              <span className="civitas-role-badge">{areaLabel[area]}</span>
              {organizationId ? <span className="civitas-context-badge">{organizationId}</span> : null}
            </div>
            <div className="civitas-topbar-right">{actions ?? (area === "public" ? null : <SignOutActionButton onAction={() => signOut(APP_ENV.app.signOutRedirectUri)} />)}</div>
          </div>
        </header>
        <main className="civitas-main">{children}</main>
      </div>
    </div>
  );
};
