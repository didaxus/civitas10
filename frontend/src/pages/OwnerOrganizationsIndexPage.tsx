import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { IconBuildingCommunity, IconRefresh } from "@tabler/icons-react";
import { OwnerBadge, OwnerShell, primaryButtonClassName, secondaryButtonClassName } from "../components/owner/OwnerUI";
import { AlertStrip, EmptyState, PageHeader, SectionCard, StateRegion, StatusPill } from "../shared/ui";
import { useOwnerApi, type OwnerOrganization } from "../api/owner";
import { appRoutes } from "../navigation/routes";

type ProfileObject = Record<string, unknown>;

const asObject = (value: unknown): ProfileObject => (value && typeof value === "object" && !Array.isArray(value) ? value as ProfileObject : {});
const asText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

const getCivitasProfile = (organization: OwnerOrganization) => {
  const logto = asObject(organization.logtoOrganization);
  const customData = asObject(logto.customData ?? logto.custom_data);
  return asObject(customData.mainContactOfCivitas ?? customData.civitasProfile);
};

const getBusinessProfile = (organization: OwnerOrganization) => asObject(getCivitasProfile(organization).business);

const firstText = (...values: unknown[]) => values.map(asText).find(Boolean) ?? null;

const getOrganizationSummary = (organization: OwnerOrganization) => {
  const logto = asObject(organization.logtoOrganization);
  const profile = asObject(organization.profile);
  const business = getBusinessProfile(organization);
  const bootstrap = asObject(organization.bootstrap);
  const runtimeState = asObject(organization.runtimeState ?? profile.runtimeState);
  const crm = asObject(runtimeState.crm);
  const appUrl = firstText(business.appUrl, business.url, business.website, business.domain, business.appSubdomain);
  const location = [firstText(business.city), firstText(business.state, business.region), firstText(business.country)].filter(Boolean).join(", ");

  return {
    id: organization.logtoOrganizationId,
    name: organization.name || asText(logto.name) || "Unnamed Logto organization",
    type: firstText(business.type, business.industry, business.segment),
    nit: firstText(business.nit, business.taxId, business.identification),
    appUrl,
    location: location || null,
    email: firstText(asObject(business.contact).email, business.email, asObject(logto.customData).contactEmail),
    phone: firstText(asObject(business.contact).phone, business.phone),
    status: firstText(bootstrap.status, crm.status, profile.fluentcrmSyncStatus) || "logto_canonical",
  };
};

const OrganizationCard = ({ organization }: { organization: OwnerOrganization }) => {
  const summary = getOrganizationSummary(organization);
  const detailPath = summary.id ? appRoutes.ownerOrganizationState.build?.({ organizationId: summary.id }) ?? null : null;
  const cardContent = (
    <>
      <div className="civitas-card-header">
        <div className="civitas-cluster">
          <IconBuildingCommunity size={22} aria-hidden="true" />
          <div>
            <h2 className="civitas-card-title">{summary.name}</h2>
            <p className="civitas-card-description">Logto canonical organization</p>
          </div>
        </div>
        <OwnerBadge tone={summary.status === "completed" || summary.status === "linked" || summary.status === "logto_canonical" ? "success" : "warning"}>{summary.status}</OwnerBadge>
      </div>
      <dl className="civitas-organization-card-details">
        <div><dt>Segment</dt><dd>{summary.type || "Not provided"}</dd></div>
        <div><dt>NIT / ID</dt><dd>{summary.nit || "Not provided"}</dd></div>
        <div><dt>Domain or URL</dt><dd>{summary.appUrl || "Not provided"}</dd></div>
        <div><dt>Location</dt><dd>{summary.location || "Not provided"}</dd></div>
        <div><dt>Contact email</dt><dd>{summary.email || "Not provided"}</dd></div>
        <div><dt>Phone</dt><dd>{summary.phone || "Not provided"}</dd></div>
      </dl>
      <p className="civitas-muted text-sm">Open organization detail to manage Overview, Governance and Operations.</p>
    </>
  );
  return detailPath ? (
    <Link to={detailPath} className="civitas-card civitas-stack civitas-clickable-card" data-owner-organization-card="true" aria-label={`Open ${summary.name} organization detail`}>
      {cardContent}
    </Link>
  ) : (
    <article className="civitas-card civitas-stack" data-owner-organization-card="true">
      {cardContent}
      <span className="civitas-muted">Detail requires a Logto organization id.</span>
    </article>
  );
};

const OwnerOrganizationsIndexPage = () => {
  const ownerApi = useOwnerApi();
  const [organizations, setOrganizations] = useState<OwnerOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOrganizations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await ownerApi.getOrganizations();
      setOrganizations(response.organizations || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load owner organizations from Logto.");
    } finally {
      setLoading(false);
    }
  }, [ownerApi]);

  useEffect(() => { void loadOrganizations(); }, [loadOrganizations]);

  const sourceLabel = useMemo(() => loading ? "loading" : `${organizations.length} Logto organizations`, [loading, organizations.length]);

  return (
    <OwnerShell>
      <PageHeader eyebrow="Owner organizations" title="Organizations" description="Gestión owner_global de organizaciones reales de Logto, enriquecida con señales operativas de Civitas sin convertir PostgreSQL en fuente canónica." />
      {error ? <StateRegion><AlertStrip variant="danger" title="Could not load organizations">Failed to load the owner organization listing. The canonical source remains Logto. <button type="button" className={secondaryButtonClassName} onClick={() => void loadOrganizations()}><IconRefresh size={18} />Retry</button></AlertStrip></StateRegion> : null}
      <SectionCard title="Organization directory" description="Cards accionables con identidad canónica Logto y perfil operacional enriquecido cuando existe." actions={<><StatusPill status="live" noDot>{sourceLabel}</StatusPill><Link to={appRoutes.ownerCreateOrganization.path} className={primaryButtonClassName}>Create organization</Link></>}>
        {loading ? <EmptyState message="Loading organizations..." /> : null}
        {!loading && !error && organizations.length === 0 ? <EmptyState message="No Logto organizations are available yet. Create the first canonical organization to start provisioning operational signals."><Link to={appRoutes.ownerCreateOrganization.path} className={primaryButtonClassName}>Create organization</Link></EmptyState> : null}
        {!loading && organizations.length > 0 ? <div className="civitas-grid-3">{organizations.map((organization, index) => <OrganizationCard key={organization.logtoOrganizationId || organization.name || String(index)} organization={organization} />)}</div> : null}
      </SectionCard>
    </OwnerShell>
  );
};

export default OwnerOrganizationsIndexPage;
