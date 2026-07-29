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

export function PlanningRemoteScreen(props: Props) { const readOnly = props.readOnly || props.availability === "degraded"; const api = usePlanningApi(); const data = usePlanningData(props.organizationId, props.screen, props.planId); const isArchived = data.plan?.status === "archived"; const title = `Planning ${props.screen}`; if (props.access === "denied") return <Denied />; if (props.availability === "unavailable" || props.availability === "incompatible") return <><PageHeader eyebrow="Planning" title={title} /><Banner state={props.availability} /></>; if (data.loading) return <><PageHeader eyebrow="Planning" title={title} /><StateRegion><p role="status">Loading Planning workspace…</p></StateRegion></>;
  const save = async (input: PlanningPlanInput) => { try { if (props.screen === "create") data.setPlan((await api.createPlan(props.organizationId, input)) ?? null); else if (data.plan) data.setPlan((await api.updatePlan(props.organizationId, data.plan.planId, input, data.plan.etag || data.plan.version)) ?? null); } catch (e) { data.setError(e as PlanningApiError); } };
  return <main className="civitas-stack-lg" data-module="planning" aria-labelledby="planning-title"><PageHeader eyebrow="Planning" title={<span id="planning-title">{title}</span>} description="Organization-aware Planning remote UI." actions={!readOnly && props.screen !== "create" ? <button className="civitas-button" onClick={() => api.createPlan(props.organizationId, { title: "Untitled plan" })}>New plan</button> : null} /><Banner state={props.availability} error={data.error} readOnly={readOnly || isArchived} />{(props.screen === "home" || props.screen === "list") && <PlanList plans={data.plans} />}{props.screen === "create" && <SectionCard><PlanForm readOnly={readOnly} onSubmit={save} /></SectionCard>}{(props.screen === "detail" || props.screen === "edit") && <PlanDetail plan={data.plan} edit={props.screen === "edit"} readOnly={readOnly || isArchived} onSubmit={save} />}{props.screen === "profile" && <SectionCard><h2>Planning profile</h2><p>Configure planning mode, fiscal-year preferences, and organization defaults through the typed public client.</p></SectionCard>}{props.screen === "handoffs" && <HandoffStatus organizationId={props.organizationId} />}</main>; }
function HandoffStatus({organizationId}:{organizationId:string}) { const api=usePlanningApi(); const [items,setItems]=useState<ProductionHandoffOperation[]>([]); useEffect(()=>{const c=new AbortController();api.listProductionHandoffs(organizationId,c.signal).then(v=>setItems(v||[]));return()=>c.abort();},[api,organizationId]); return <SectionCard><h2>Production handoffs</h2><div aria-live="polite">{items.length?items.map(item=><article key={item.operationId}><strong>Plan {item.planId} v{item.planVersion}</strong> <StatusPill status={item.state==="succeeded"?"success":item.state==="failed"?"danger":"neutral"}>{item.state}</StatusPill></article>):<p>No production handoffs yet.</p>}</div></SectionCard>; }
function PlanList({ plans }: { plans: PlanningPlan[] }) { if (!plans.length) return <EmptyState message="No planning records yet."><a className="civitas-button" href="./create">Create a plan</a></EmptyState>; return <SectionCard><div className="civitas-responsive-table" role="region" aria-label="Planning plans" tabIndex={0}><table><thead><tr><th>Title</th><th>Status</th><th>Updated</th></tr></thead><tbody>{plans.map((p) => <tr key={p.planId}><td><a href={`./${p.planId}`}>{p.title}</a></td><td><StatusPill status={p.status === "archived" ? "neutral" : "success"}>{p.status}</StatusPill></td><td>{p.updatedAt || "Not available"}</td></tr>)}</tbody></table></div></SectionCard>; }
function PlanDetail({ plan, edit, readOnly, onSubmit }: { plan: PlanningPlan | null; edit: boolean; readOnly?: boolean; onSubmit: (input: PlanningPlanInput) => Promise<void> }) { if (!plan) return <EmptyState message="Planning record was not found or is no longer available." />; return <SectionCard>{edit ? <PlanForm initial={plan} readOnly={readOnly} onSubmit={onSubmit} /> : <><h2>{plan.title}</h2><p>{plan.description || "No description provided."}</p><StatusPill status={plan.status === "archived" ? "neutral" : "success"}>{plan.status}</StatusPill></>}</SectionCard>; }
function Denied() { return <main className="civitas-stack-lg"><PageHeader eyebrow="Planning" title="Access denied" /><StateRegion><p role="alert">{copy.denied}</p></StateRegion></main>; }
export function PlanningBundleFailureFallback() { return <StateRegion><p role="alert">Planning could not be loaded. The host fallback kept the shell available.</p></StateRegion>; }
export default PlanningRemoteScreen;
