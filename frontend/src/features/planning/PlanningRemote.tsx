import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, FormField, PageHeader, SectionCard, StateRegion, StatusPill } from "../../shared/ui";
import { PlanningApiError, type PlanningPlan, type PlanningPlanInput, type PlanningPlanType, type PlanningProfile, usePlanningApi } from "./planningApi";

type Screen = "home" | "list" | "create" | "detail" | "edit" | "profile";
type Props = {
  organizationId: string;
  screen: Screen;
  planId?: string;
  readOnly?: boolean;
  access?: "allowed" | "denied";
  availability?: "available" | "unavailable" | "degraded" | "incompatible";
  canCreate?: boolean;
  canUpdate?: boolean;
  canReplaceProfile?: boolean;
};

const copy = {
  denied: "You do not have access to Planning in this organization.",
  unavailable: "Planning is temporarily unavailable.",
  incompatible: "This Planning UI is incompatible with the active host contract.",
  conflict: "Someone else updated this resource. Reload before saving again.",
  validation: "Check the highlighted fields and try again.",
  archived: "Archived plans are read-only.",
};
const plansPath = (organizationId: string, suffix = "") => `/o/${encodeURIComponent(organizationId)}/planning/plans${suffix}`;

function errorMessage(error: PlanningApiError | null) {
  if (!error) return null;
  if (error.status === 409 || error.status === 412 || error.code === "precondition_failed" || error.code === "stale") return copy.conflict;
  if (error.status === 422 || error.code === "validation") return copy.validation;
  if (error.code === "archived") return copy.archived;
  return error.message;
}

function asPlanningError(error: unknown) {
  return error instanceof PlanningApiError ? error : new PlanningApiError(error instanceof Error ? error.message : String(error));
}

export function PlanningRemoteScreen(props: Props) {
  const api = usePlanningApi();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanningPlan[]>([]);
  const [plan, setPlan] = useState<PlanningPlan | null>(null);
  const [profile, setProfile] = useState<PlanningProfile | null>(null);
  const [error, setError] = useState<PlanningApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const focusRef = useRef<HTMLDivElement>(null);
  const orgRef = useRef(props.organizationId);

  useEffect(() => {
    const controller = new AbortController();
    orgRef.current = props.organizationId;
    setPlans([]);
    setPlan(null);
    setProfile(null);
    setError(null);

    if (props.screen === "create") {
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    const request = props.screen === "home" || props.screen === "list"
      ? api.listPlans(props.organizationId, controller.signal).then((value) => setPlans(value.data))
      : props.screen === "profile"
        ? api.getProfile(props.organizationId, controller.signal).then(setProfile)
        : props.planId
          ? api.readPlan(props.organizationId, props.planId, controller.signal).then(setPlan)
          : Promise.reject(new PlanningApiError("A plan id is required.", 400, "validation"));

    request.catch((reason: unknown) => {
      if (!controller.signal.aborted && orgRef.current === props.organizationId) setError(asPlanningError(reason));
    }).finally(() => {
      if (!controller.signal.aborted && orgRef.current === props.organizationId) setLoading(false);
    });
    return () => controller.abort();
  }, [api, props.organizationId, props.planId, props.screen]);

  useEffect(() => { if (!loading) focusRef.current?.focus(); }, [loading, error, props.screen]);

  const savePlan = async (input: PlanningPlanInput) => {
    setSaving(true);
    setError(null);
    try {
      if (props.screen === "create") {
        const created = await api.createPlan(props.organizationId, input);
        setPlan(created);
        navigate(plansPath(props.organizationId, `/${encodeURIComponent(created.id)}`));
      } else if (plan) {
        const updated = await api.updatePlan(props.organizationId, plan.id, input, plan.version);
        setPlan(updated);
      }
    } catch (reason) {
      setError(asPlanningError(reason));
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async (input: Pick<PlanningProfile, "planningMode" | "preferences">) => {
    if (!profile) return;
    setSaving(true);
    setError(null);
    try {
      setProfile(await api.replaceProfile(props.organizationId, input, profile.version));
    } catch (reason) {
      setError(asPlanningError(reason));
    } finally {
      setSaving(false);
    }
  };

  const title = props.screen === "profile" ? "Planning profile" : props.screen === "create" ? "Create plan" : "Planning plans";
  if (props.access === "denied") return <Denied />;
  if (props.availability === "unavailable" || props.availability === "incompatible") {
    return <main><PageHeader eyebrow="Planning" title={title} /><Banner state={props.availability} /></main>;
  }

  const readOnly = Boolean(props.readOnly || props.availability === "degraded");
  const archived = plan?.status === "archived";
  return (
    <main className="civitas-stack-lg" data-module="planning" aria-labelledby="planning-title">
      <PageHeader eyebrow="Planning" title={<span id="planning-title">{title}</span>} description="Organization-aware Planning workspace."
        actions={!readOnly && props.canCreate && props.screen !== "create" ? <Link className="civitas-button" to={plansPath(props.organizationId, "/create")}>New plan</Link> : null} />
      <div ref={focusRef} tabIndex={-1}>
        <Banner state={props.availability} error={error} archived={archived} />
        {loading ? <StateRegion><p role="status">Loading Planning workspace…</p></StateRegion> : null}
        {!loading && (props.screen === "home" || props.screen === "list") ? <PlanList organizationId={props.organizationId} plans={plans} canCreate={!readOnly && props.canCreate} /> : null}
        {!loading && props.screen === "create" ? <SectionCard><PlanForm create readOnly={readOnly || !props.canCreate} saving={saving} onSubmit={savePlan} /></SectionCard> : null}
        {!loading && (props.screen === "detail" || props.screen === "edit") ? <PlanDetail organizationId={props.organizationId} plan={plan} edit={props.screen === "edit"} readOnly={readOnly || archived || !props.canUpdate} saving={saving} onSubmit={savePlan} /> : null}
        {!loading && props.screen === "profile" ? <ProfileForm profile={profile} readOnly={readOnly || !props.canReplaceProfile} saving={saving} onSubmit={saveProfile} /> : null}
      </div>
    </main>
  );
}

export function Banner({ state, error, archived }: { state?: Props["availability"]; error?: PlanningApiError | null; archived?: boolean }) {
  const message = state === "unavailable" ? copy.unavailable : state === "incompatible" ? copy.incompatible : errorMessage(error || null);
  return <div aria-live="polite">{state === "degraded" ? <p role="status">Planning is in degraded read-only mode.</p> : null}{archived ? <p role="status">{copy.archived}</p> : null}{message ? <p role="alert">{message}</p> : null}</div>;
}

export function PlanForm({ initial, create, readOnly, saving, onSubmit }: { initial?: PlanningPlan; create?: boolean; readOnly?: boolean; saving?: boolean; onSubmit: (input: PlanningPlanInput) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [planType, setPlanType] = useState<PlanningPlanType>(initial?.planType || "curriculum");
  const [validation, setValidation] = useState<string | null>(null);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { setValidation("Title is required."); return; }
    setValidation(null);
    void onSubmit({ title: title.trim(), description: description.trim() || null, ...(create ? { planType } : {}) });
  };
  return <form className="civitas-stack-md" onSubmit={submit} noValidate>
    <FormField id="planning-title-input" label="Title" required error={validation}>
      <input id="planning-title-input" value={title} onChange={(event) => setTitle(event.target.value)} disabled={readOnly || saving} aria-invalid={Boolean(validation)} aria-describedby={validation ? "planning-title-error" : undefined} />
    </FormField>
    {validation ? <span id="planning-title-error" className="sr-only">{validation}</span> : null}
    <FormField id="planning-description" label="Description"><textarea id="planning-description" value={description} onChange={(event) => setDescription(event.target.value)} disabled={readOnly || saving} /></FormField>
    {create ? <FormField id="planning-plan-type" label="Plan type" required><select id="planning-plan-type" value={planType} onChange={(event) => setPlanType(event.target.value as PlanningPlanType)} disabled={readOnly || saving}><option value="strategic">Strategic</option><option value="tactical">Tactical</option><option value="operational">Operational</option><option value="project">Project</option><option value="curriculum">Curriculum</option></select></FormField> : null}
    <button className="civitas-button" type="submit" disabled={readOnly || saving}>{saving ? "Saving…" : "Save plan"}</button>
  </form>;
}

export function PlanList({ organizationId, plans, canCreate }: { organizationId: string; plans: PlanningPlan[]; canCreate?: boolean }) {
  if (!plans.length) return <EmptyState message="No planning records yet.">{canCreate ? <Link className="civitas-button" to={plansPath(organizationId, "/create")}>Create a plan</Link> : null}</EmptyState>;
  return <SectionCard><div className="civitas-responsive-table" role="region" aria-label="Planning plans" tabIndex={0}><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th></tr></thead><tbody>{plans.map((item) => <tr key={item.id}><td><Link to={plansPath(organizationId, `/${encodeURIComponent(item.id)}`)}>{item.title}</Link></td><td><StatusPill status={item.status === "archived" ? "neutral" : "success"}>{item.status}</StatusPill></td><td>{item.updatedAt}</td></tr>)}</tbody></table></div></SectionCard>;
}

export function PlanDetail({ organizationId, plan, edit, readOnly, saving, onSubmit }: { organizationId: string; plan: PlanningPlan | null; edit: boolean; readOnly?: boolean; saving?: boolean; onSubmit: (input: PlanningPlanInput) => Promise<void> }) {
  if (!plan) return <EmptyState message="Planning record was not found or is no longer available." />;
  return <SectionCard>{edit ? <PlanForm initial={plan} readOnly={readOnly} saving={saving} onSubmit={onSubmit} /> : <div className="civitas-stack-md"><h2>{plan.title}</h2><p>{plan.description || "No description provided."}</p><StatusPill status={plan.status === "archived" ? "neutral" : "success"}>{plan.status}</StatusPill>{!readOnly ? <Link className="civitas-button" to={plansPath(organizationId, `/${encodeURIComponent(plan.id)}/edit`)}>Edit plan</Link> : null}</div>}</SectionCard>;
}

export function ProfileForm({ profile, readOnly, saving, onSubmit }: { profile: PlanningProfile | null; readOnly?: boolean; saving?: boolean; onSubmit: (input: Pick<PlanningProfile, "planningMode" | "preferences">) => Promise<void> }) {
  const [planningMode, setPlanningMode] = useState<PlanningProfile["planningMode"]>(profile?.planningMode || "standard");
  const [fiscalYearStart, setFiscalYearStart] = useState(profile?.preferences.fiscalYearStart || "");
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  useEffect(() => { if (profile) { setPlanningMode(profile.planningMode); setFiscalYearStart(profile.preferences.fiscalYearStart || ""); } }, [profile]);
  if (!profile) return <EmptyState message="Planning profile is not available." />;
  return <SectionCard><form className="civitas-stack-md" noValidate onSubmit={(event) => { event.preventDefault(); if (fiscalYearStart && !/^\d{2}-\d{2}$/.test(fiscalYearStart)) { setFiscalError("Fiscal year start must use MM-DD."); return; } setFiscalError(null); void onSubmit({ planningMode, preferences: { fiscalYearStart } }); }}>
    <FormField id="planning-mode" label="Planning mode"><select id="planning-mode" value={planningMode} onChange={(event) => setPlanningMode(event.target.value as PlanningProfile["planningMode"])} disabled={readOnly || saving}><option value="standard">Standard</option><option value="curriculum">Curriculum</option><option value="strategic">Strategic</option></select></FormField>
    <FormField id="fiscal-year-start" label="Fiscal year start" hint="Use MM-DD, for example 07-01." error={fiscalError}><input id="fiscal-year-start" value={fiscalYearStart} pattern="[0-9]{2}-[0-9]{2}" placeholder="MM-DD" onChange={(event) => setFiscalYearStart(event.target.value)} disabled={readOnly || saving} aria-invalid={Boolean(fiscalError)} aria-describedby={fiscalError ? "fiscal-year-start-error" : undefined} /></FormField>
    {fiscalError ? <span id="fiscal-year-start-error" className="sr-only">{fiscalError}</span> : null}
    <button className="civitas-button" type="submit" disabled={readOnly || saving}>{saving ? "Saving…" : "Save profile"}</button>
  </form></SectionCard>;
}

export function Denied() { return <main className="civitas-stack-lg"><PageHeader eyebrow="Planning" title="Access denied" /><StateRegion><p role="alert">{copy.denied}</p></StateRegion></main>; }
export function PlanningBundleFailureFallback() { return <StateRegion><p role="alert">Planning could not be loaded. The host fallback kept the shell available.</p></StateRegion>; }
export default PlanningRemoteScreen;
