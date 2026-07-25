import { useEffect, useState } from "react";
import { Link } from "react-router";
import { OwnerBadge, OwnerShell, ownerToneFromSeverity } from "../components/owner/OwnerUI";
import { AlertStrip, KpiGrid, MetricCard, PageHeader, SectionCard, StateRegion, StatusPill } from "../shared/ui";
import { useOwnerApi, type OwnerOrganization, type WorkerHealthAggregate } from "../api/owner";
import { appRoutes } from "../navigation/routes";

const OwnerOperationalHomePage = () => {
  const ownerApi = useOwnerApi();
  const [organizations, setOrganizations] = useState<OwnerOrganization[]>([]);
  const [runtime, setRuntime] = useState<WorkerHealthAggregate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [orgResponse, runtimeResponse] = await Promise.all([
          ownerApi.getOrganizations(),
          ownerApi.getWorkerQueuesObservability(),
        ]);
        if (cancelled) return;
        setOrganizations(orgResponse.organizations || []);
        setRuntime(runtimeResponse);
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Failed to load owner operational overview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [ownerApi]);

  return (
    <OwnerShell>
      <PageHeader eyebrow="Owner overview" title="Global owner summary" description="Resumen ejecutivo del estado global: organizaciones, señales críticas y accesos profundos a vistas especializadas. El detalle técnico vive en Operations y la creación vive en Create." />

      {error ? <StateRegion><AlertStrip variant="danger">{error}</AlertStrip></StateRegion> : null}

      <KpiGrid cols={3}>
        <MetricCard label="Organizations" value={loading ? "..." : organizations.length} variant={loading ? "neutral" : "ok"} />
        <MetricCard label="Runtime status" detail={runtime?.workerHealth.humanMessage || "Runtime status not loaded yet."}>
          {runtime ? <OwnerBadge tone={ownerToneFromSeverity(runtime.workerHealth.severity)}>{runtime.workerHealth.classification}</OwnerBadge> : <StatusPill status="unknown">loading</StatusPill>}
        </MetricCard>
        <MetricCard label="Blocked organizations" value={runtime?.blockedOrganizations.length ?? 0} variant={(runtime?.blockedOrganizations.length ?? 0) > 0 ? "danger" : "ok"}>
          <Link to={appRoutes.ownerSystem.path} className="civitas-nav-link">View operational issues</Link>
        </MetricCard>
      </KpiGrid>

      <SectionCard title="Organizations" description="Directorio canónico movido a una vista especializada para mantener este Overview como resumen ejecutivo." icon="◫" actions={<Link to={appRoutes.ownerOrganizations.path} className="civitas-secondary-button">View organizations</Link>}>
        <div className="civitas-cluster">
          <OwnerBadge tone="info">Logto canonical source</OwnerBadge>
          <span className="civitas-muted">{loading ? "Loading organization count..." : `${organizations.length} organizations available for owner_global management.`}</span>
        </div>
      </SectionCard>
    </OwnerShell>
  );
};

export default OwnerOperationalHomePage;
