import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, PageHeader, SectionCard, StateRegion, StatusPill } from "../../shared/ui";
import { PlanningApiError, type PlanningPlan, type PlanningPlanInput, type PlanningProfile, usePlanningApi } from "./planningApi";

type Screen = "home" | "list" | "create" | "detail" | "edit" | "profile" | "roadmaps";
type Props = { organizationId: string; screen: Screen; planId?: string; readOnly?: boolean; access?: "allowed" | "denied"; availability?: "available" | "unavailable" | "degraded" | "incompatible" };
const copy = { denied: "You do not have access to Planning in this organization.", unavailable: "Planning is temporarily unavailable.", incompatible: "This Planning UI is incompatible with the active host contract.", conflict: "Someone else updated this resource. Reload before saving again.", validation: "Check the highlighted fields and try again.", archived: "Archived plans are read-only." };
const path = (organizationId: string, suffix = "") => `/o/${encodeURIComponent(organizationId)}/planning/plans${suffix}`;

function errorMessage(error: PlanningApiError | null) {
  if (!error) return null;
  if (error.status === 409 || error.status === 412 || error.code === "precondition_failed" || error.code === "stale") return copy.conflict;
  if (error.status === 422 || error.code === "validation") return copy.validation;
  if (error.code === "archived") return copy.archived;
  return error.message;
}

export function PlanningRemoteScreen(props: Props) {
  const api = usePlanningApi();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<PlanningPlan[]>([]);
  const [plan, setPlan] = useState<PlanningPlan | null>(null);
  const [profile, setProfile] = useState<PlanningProfile | null>(null);
  const [error, setError] = useState<PlanningApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const orgRef = useRef(props.organizationId);
  const readOnly = Boolean(props.readOnly || props.availability === "degraded" || plan?.status === "archived");

  useEffect(() => {
    const controller = new AbortController();
    if (orgRef.current !== props.organizationId) { setPlans([]); setPlan(null); setProfile(null); orgRef.current = props.organizationId; }
    setLoading(true); setError(null);
    const load = async () => {
      try {
        if (props.screen === "detail" || props.screen === "edit") setPlan((await api.getPlan(props.organizationId, props.planId || "", controller.signal))!);
        else if (props.screen === "profile") setProfile((await api.getProfile(props.organizationId, controller.signal))!);
        else setPlans((await api.listPlans(props.organizationId, controller.signal))!.items);
      } catch (value) { if (!controller.signal.aborted) setError(value instanceof PlanningApiError ? value : new PlanningApiError(String(value))); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); return () => controller.abort();
  }, [api, props.organizationId, props.planId, props.screen]);

  if (props.access === "denied") return <Denied />;
  const title = `Planning ${props.screen}`;
  if (props.availability === "unavailable" || props.availability === "incompatible") return <><PageHeader eyebrow="Planning" title={title} /><StateRegion><p role="alert">{copy[props.availability]}</p></StateRegion></>;
  if (loading) return <><PageHeader eyebrow="Planning" title={title} /><StateRegion><p role="status" aria-live="polite">Loading Planning workspace…</p></StateRegion></>;

  const savePlan = async (input: PlanningPlanInput) => {
    setError(null);
    try {
      if (props.screen === "create") {
        const created = (await api.createPlan(props.organizationId, input))!;
        navigate(path(props.organizationId, `/${encodeURIComponent(created.planId)}`));
      } else if (plan) setPlan((await api.updatePlan(props.organizationId, plan.planId, input, plan.etag || plan.version))!);
    } catch (value) { setError(value instanceof PlanningApiError ? value : new PlanningApiError(String(value))); }
  };
  const saveProfile = async (input: Pick<PlanningProfile, "planningMode" | "preferences">) => {
    if (!profile) return;
    setError(null);
    try { setProfile((await api.replaceProfile(props.organizationId, input, profile.etag || profile.version))!); }
    catch (value) { setError(value instanceof PlanningApiError ? value : new PlanningApiError(String(value))); }
  };

  return <main className="civitas-stack-lg" data-module="planning" aria-labelledby="planning-title">
    <PageHeader eyebrow="Planning" title={<span id="planning-title">{title}</span>} description="Organization-aware Planning workspace." actions={!readOnly && props.screen !== "create" ? <Link className="civitas-button" to={path(props.organizationId, "/create")}>New plan</Link> : null} />
    {(props.availability === "degraded" || error || plan?.status === "archived") && <StateRegion><p role={error ? "alert" : "status"} aria-live="assertive">{props.availability === "degraded" ? "Planning is in degraded read-only mode. Write actions are disabled." : plan?.status === "archived" ? copy.archived : errorMessage(error)}</p></StateRegion>}
    {(props.screen === "home" || props.screen === "list") && <PlanList organizationId={props.organizationId} plans={plans} />}
    {props.screen === "create" && <SectionCard><PlanForm readOnly={readOnly} onSubmit={savePlan} /></SectionCard>}
    {(props.screen === "detail" || props.screen === "edit") && <PlanDetail organizationId={props.organizationId} plan={plan} edit={props.screen === "edit"} readOnly={readOnly} onSubmit={savePlan} />}
    {props.screen === "profile" && <ProfileForm profile={profile} readOnly={readOnly} onSubmit={saveProfile} />}
  </main>;
}

function PlanForm({ initial, readOnly, onSubmit }: { initial?: PlanningPlan | null; readOnly?: boolean; onSubmit: (input: PlanningPlanInput) => Promise<void> }) {
  const [title, setTitle] = useState(initial?.title || ""); const [description, setDescription] = useState(initial?.description || ""); const [saving, setSaving] = useState(false); const ref = useRef<HTMLInputElement>(null); const invalid = title.trim().length < 3;
  useEffect(() => { ref.current?.focus(); }, []);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (invalid || readOnly) return; setSaving(true); try { await onSubmit({ title: title.trim(), description }); } finally { setSaving(false); } };
  return <form className="civitas-stack-md" onSubmit={submit}><label>Plan title<input ref={ref} value={title} onChange={e => setTitle(e.target.value)} aria-invalid={invalid} aria-describedby="plan-title-error" disabled={readOnly} /></label><p id="plan-title-error" aria-live="polite">{invalid ? "Title must be at least 3 characters." : ""}</p><label>Description<textarea value={description} onChange={e => setDescription(e.target.value)} disabled={readOnly} /></label><p role="status" aria-live="polite">{readOnly ? "Read-only mode" : saving ? "Saving plan…" : "Ready to save"}</p><button className="civitas-button" disabled={readOnly || invalid || saving}>{saving ? "Saving…" : "Save plan"}</button></form>;
}
function PlanList({ organizationId, plans }: { organizationId: string; plans: PlanningPlan[] }) { if (!plans.length) return <EmptyState message="No planning records yet."><Link className="civitas-button" to={path(organizationId, "/create")}>Create a plan</Link></EmptyState>; return <SectionCard><div className="civitas-responsive-table" role="region" aria-label="Planning plans" tabIndex={0}><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th></tr></thead><tbody>{plans.map(p => <tr key={p.planId}><td><Link to={path(organizationId, `/${encodeURIComponent(p.planId)}`)}>{p.title}</Link></td><td><StatusPill status={p.status === "archived" ? "neutral" : "success"}>{p.status}</StatusPill></td><td>{p.updatedAt || "Not available"}</td></tr>)}</tbody></table></div></SectionCard>; }
function PlanDetail({ organizationId, plan, edit, readOnly, onSubmit }: { organizationId: string; plan: PlanningPlan | null; edit: boolean; readOnly: boolean; onSubmit: (input: PlanningPlanInput) => Promise<void> }) { if (!plan) return <EmptyState message="Planning record was not found or is no longer available." />; return <SectionCard>{edit ? <PlanForm initial={plan} readOnly={readOnly} onSubmit={onSubmit} /> : <><h2>{plan.title}</h2><p>{plan.description || "No description provided."}</p><StatusPill status={plan.status === "archived" ? "neutral" : "success"}>{plan.status}</StatusPill>{!readOnly && <p><Link className="civitas-button" to={path(organizationId, `/${encodeURIComponent(plan.planId)}/edit`)}>Edit plan</Link></p>}</>}</SectionCard>; }
function ProfileForm({ profile, readOnly, onSubmit }: { profile: PlanningProfile | null; readOnly: boolean; onSubmit: (input: Pick<PlanningProfile, "planningMode" | "preferences">) => Promise<void> }) { const [mode, setMode] = useState(profile?.planningMode || "standard"); const [fiscal, setFiscal] = useState(profile?.preferences.fiscalYearStart || "01-01"); const [saving, setSaving] = useState(false); const ref = useRef<HTMLSelectElement>(null); useEffect(() => ref.current?.focus(), []); if (!profile) return <EmptyState message="Planning profile is not available." />; const submit = async (event: FormEvent) => { event.preventDefault(); if (readOnly) return; setSaving(true); try { await onSubmit({ planningMode: mode, preferences: { fiscalYearStart: fiscal } }); } finally { setSaving(false); } }; return <SectionCard><h2>Planning profile</h2><form className="civitas-stack-md" onSubmit={submit}><label>Planning mode<select ref={ref} value={mode} onChange={e => setMode(e.target.value as PlanningProfile["planningMode"])} disabled={readOnly}><option value="standard">Standard</option><option value="curriculum">Curriculum</option><option value="strategic">Strategic</option></select></label><label>Fiscal year start<input value={fiscal} onChange={e => setFiscal(e.target.value)} pattern="[0-9]{2}-[0-9]{2}" disabled={readOnly} /></label><p role="status" aria-live="polite">{saving ? "Saving profile…" : readOnly ? "Read-only mode" : "Profile loaded"}</p><button className="civitas-button" disabled={readOnly || saving}>{saving ? "Saving…" : "Save profile"}</button></form></SectionCard>; }
function Denied() { return <main className="civitas-stack-lg"><PageHeader eyebrow="Planning" title="Access denied" /><StateRegion><p role="alert">{copy.denied}</p></StateRegion></main>; }
export function PlanningBundleFailureFallback() { return <StateRegion><p role="alert">Planning could not be loaded. The host fallback kept the shell available.</p></StateRegion>; }
export default PlanningRemoteScreen;
