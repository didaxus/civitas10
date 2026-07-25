import { useLogto } from "@logto/react";
import { Link, useLocation, useNavigate } from "react-router";
import { APP_ENV } from "../env";
import { appRoutes } from "../navigation/routes";
import { SignOutActionButton } from "./layout/TopBar/ActionButtons";

type TopbarProps = {
  organizationId?: string;
  showBackButton?: boolean;
};

const navLinkClass = (active: boolean) =>
  `civitas-nav-link ${active ? "civitas-nav-link-active" : ""}`;

const Topbar = ({ organizationId, showBackButton = false }: TopbarProps) => {
  const { signOut } = useLogto();
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="civitas-topbar">
      <div className="civitas-topbar-inner">
        <div className="civitas-topbar-left">
          {showBackButton ? (
            <button type="button" onClick={() => navigate(-1)} className="civitas-secondary-button">
              Back
            </button>
          ) : null}
          <Link to={appRoutes.owner.path} className="text-xl font-semibold text-text">Civitas</Link>
          <nav className="civitas-primary-nav">
            <Link to={appRoutes.owner.path} className={navLinkClass(location.pathname === appRoutes.owner.path)}>Overview</Link>
            <Link to={appRoutes.ownerOrganizations.path} className={navLinkClass(location.pathname.startsWith(appRoutes.ownerOrganizations.path) && location.pathname !== appRoutes.owner.path)}>Create</Link>
            <Link to={appRoutes.ownerWorkerQueues.path} className={navLinkClass(location.pathname.startsWith(appRoutes.ownerWorkerQueues.path))}>Runtime</Link>
          </nav>
          {organizationId ? <span className="civitas-badge bg-neutral-soft text-muted-strong">{organizationId}</span> : null}
        </div>
        <div className="civitas-topbar-right"><SignOutActionButton onAction={() => signOut(APP_ENV.app.signOutRedirectUri)} /></div>
      </div>
    </div>
  );
};

export default Topbar;
