import { useLogto } from "@logto/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { getMe, type MeResponse } from "../../api/me";
import { useOwnerApi, type OwnerOrganization } from "../../api/owner";
import { APP_ENV } from "../../env";
import Topbar from "../../components/Topbar";
import { appRoutes } from "../../navigation/routes";
import { AlertStrip, StateRegion } from "../../shared/ui";

type OrganizationCard = {
  id: string;
  name: string;
  description: string | null;
  role?: string;
};

const toOrganizationCards = (organizations: OwnerOrganization[]): OrganizationCard[] =>
  organizations
    .map((organization) => ({
      id: organization.logtoOrganizationId || "",
      name:
        organization.name ||
        (typeof organization.logtoOrganization?.name === "string"
          ? organization.logtoOrganization.name
          : null) ||
        "Untitled organization",
      description:
        typeof organization.logtoOrganization?.description === "string"
          ? organization.logtoOrganization.description
          : null,
      role: "Admin-org",
    }))
    .filter((organization) => Boolean(organization.id));

const Dashboard = () => {
  const { isAuthenticated, getAccessToken } = useLogto();
  const ownerApi = useOwnerApi();
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<OrganizationCard[]>([]);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadDashboardState = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    setError(null);

    try {
      const accessToken = await getAccessToken(APP_ENV.api.resource);
      if (!accessToken) throw new Error("No API access token returned by Logto");

      const meResponse = await getMe(accessToken);
      setMe(meResponse);

      const canCreateOrganizations = Boolean(meResponse.auth.owner?.canWriteOwner);

      if (canCreateOrganizations) {
        const organizationsResponse = await ownerApi.getOrganizations();
        setOrganizations(toOrganizationCards(organizationsResponse.organizations));
      } else {
        setOrganizations([]);
      }
    } catch (loadError) {
      console.error("Failed to load Civitas owner dashboard:", loadError);
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, isAuthenticated, ownerApi]);

  useEffect(() => {
    void loadDashboardState();
  }, [loadDashboardState]);

  const canCreateOrganizations = Boolean(me?.auth.owner?.canWriteOwner);

  const summary = useMemo(
    () => ({
      totalOrganizations: organizations.length,
      ownerGlobal: Boolean(me?.auth.owner.canReadOwner),
      globalRoles: me?.auth.globalRoles ?? [],
    }),
    [me, organizations.length],
  );

  const handleOrgClick = (orgId: string) => navigate(`/${orgId}`);

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Topbar />
      <div className="flex-1">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-8 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-strong">Owner global workspace</p>
              <h2 className="mt-2 text-3xl font-semibold text-text">Civitas foundation</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-strong">
                This dashboard now reads owner authority from <code>/me</code> and organizations from the owner API. It no longer treats <code>organization_data</code> as the source of truth.
              </p>
            </div>
            {canCreateOrganizations && (
              <Link
                to={appRoutes.ownerOrganizations.path}
                className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-contrast shadow-sm hover:bg-primary-strong"
              >
                Create organization
              </Link>
            )}
          </div>

          {error && (
            <StateRegion>
              <AlertStrip variant="danger" title="Could not load owner state">
                Could not load the owner state from the API. {error}
              </AlertStrip>
            </StateRegion>
          )}

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="text-sm font-medium text-muted">Owner authority</div>
              <div className="mt-3 text-2xl font-semibold text-text">{summary.ownerGlobal ? "Validated" : "Unavailable"}</div>
              <div className="mt-2 text-sm text-muted-strong">Resolved from global roles in Logto through <code>/me</code>.</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="text-sm font-medium text-muted">Organizations in API</div>
              <div className="mt-3 text-2xl font-semibold text-text">{loading ? "…" : summary.totalOrganizations}</div>
              <div className="mt-2 text-sm text-muted-strong">Fetched from canonical Logto organizations.</div>
            </div>
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="text-sm font-medium text-muted">Global roles</div>
              <div className="mt-3 text-sm font-medium text-text">{summary.globalRoles.length > 0 ? summary.globalRoles.join(", ") : "No global roles loaded"}</div>
              <div className="mt-2 text-sm text-muted-strong">The clean owner flow only unlocks organization creation when <code>owner_global</code> is present.</div>
            </div>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-border bg-surface px-6 py-10 text-center text-sm text-muted shadow-sm">
              Loading owner authority from <code>/me</code> and canonical organizations from the API...
            </div>
          ) : organizations.length === 0 ? (
            <div className="rounded-2xl border border-border bg-surface p-8 shadow-sm">
              <h3 className="text-xl font-semibold text-text">No organizations visible yet</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-strong">
                If organizations already exist in Logto, this state means the owner listing still needs attention. If you are starting from scratch, continue with the clean owner provisioning page to create the first organization, its administrative users, and the custom data payload that Civitas must preserve.
              </p>
              {canCreateOrganizations ? (
                <div className="mt-6">
                  <Link
                    to={appRoutes.ownerOrganizations.path}
                    className="inline-flex items-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-contrast shadow-sm hover:bg-primary-strong"
                  >
                    Open full organization form
                  </Link>
                </div>
              ) : (
                <div className="mt-6 rounded-xl bg-bg px-4 py-3 text-sm text-muted-strong">
                  Your session is authenticated but it does not have the <code>owner_global</code> role required to create organizations.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <h3 className="text-xl font-semibold text-text">Organizations</h3>
                {canCreateOrganizations && (
                  <Link to={appRoutes.ownerOrganizations.path} className="text-sm font-medium text-primary-strong hover:text-primary-strong">
                    Create another organization
                  </Link>
                )}
              </div>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => handleOrgClick(org.id)}
                    className="rounded-2xl border border-border bg-surface p-6 text-left shadow-sm transition hover:border-border-strong hover:shadow-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="text-lg font-semibold text-text">{org.name}</h4>
                      {org.role && (
                        <span className="rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-strong">
                          {org.role}
                        </span>
                      )}
                    </div>
                    {org.description && (
                      <p className="mt-3 text-sm leading-6 text-muted-strong">{org.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
