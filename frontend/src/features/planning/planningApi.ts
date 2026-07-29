import { useMemo } from "react";
import { useApi, ApiRequestError } from "../../api/base";

export type PlanningPlanStatus = "draft" | "in_review" | "changes_requested" | "approved" | "archived";
export type PlanningPlan = { id: string; title: string; description?: string | null; status: PlanningPlanStatus; version: string; updatedAt: string; etag?: string };
export type PlanningProfile = { organizationId: string; planningMode: "standard" | "curriculum" | "strategic"; preferences: { fiscalYearStart?: string }; version: string; etag?: string };
export type PlanningListResponse = { items: PlanningPlan[]; page?: { limit?: number; nextCursor?: string | null; hasMore?: boolean } };
export type PlanningPlanInput = { title: string; description?: string };
export type PlanningProblemCode = "validation" | "precondition_failed" | "conflict" | "module_unavailable" | "module_incompatible" | "authorization_context" | "archived" | "stale" | string;
export class PlanningApiError extends Error { constructor(message: string, public status?: number, public code?: PlanningProblemCode, public details?: unknown) { super(message); this.name = "PlanningApiError"; } }

const root = (organizationId: string) => `/api/v1/o/${encodeURIComponent(organizationId)}/planning`;
const plansRoot = (organizationId: string) => `${root(organizationId)}/plans`;
const envelopeData = (value: unknown) => (value as { data?: unknown })?.data ?? value;
const assertPlan = (value: unknown): PlanningPlan => { const plan = envelopeData(value); if (!plan || typeof plan !== "object" || typeof (plan as PlanningPlan).id !== "string" || typeof (plan as PlanningPlan).title !== "string" || typeof (plan as PlanningPlan).version !== "string") throw new PlanningApiError("Planning plan contract failed", 502, "contract_invalid"); return plan as PlanningPlan; };
const assertList = (value: unknown): PlanningListResponse => { const envelope = value as { data?: unknown; page?: PlanningListResponse["page"] }; if (!Array.isArray(envelope?.data)) throw new PlanningApiError("Planning list contract failed", 502, "contract_invalid"); return { items: envelope.data.map(assertPlan), page: envelope.page }; };
const assertProfile = (value: unknown): PlanningProfile => { const profile = envelopeData(value); if (!profile || typeof profile !== "object" || typeof (profile as PlanningProfile).organizationId !== "string") throw new PlanningApiError("Planning profile contract failed", 502, "contract_invalid"); return profile as PlanningProfile; };
const mapError = (error: unknown): never => { if (error instanceof PlanningApiError) throw error; if (error instanceof ApiRequestError) throw new PlanningApiError(error.message, error.status, error.code, error.details); throw new PlanningApiError(error instanceof Error ? error.message : String(error)); };

export const usePlanningApi = () => { const { organizationApiFetch } = useApi(); return useMemo(() => ({
  listPlans: async (organizationId: string, signal?: AbortSignal) => { try { return assertList(await organizationApiFetch(organizationId, plansRoot(organizationId), { signal })); } catch (e) { mapError(e); } },
  getPlan: async (organizationId: string, planId: string, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${plansRoot(organizationId)}/${encodeURIComponent(planId)}`, { signal })); } catch (e) { mapError(e); } },
  createPlan: async (organizationId: string, input: PlanningPlanInput, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, plansRoot(organizationId), { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { mapError(e); } },
  updatePlan: async (organizationId: string, planId: string, input: PlanningPlanInput, etag: string, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${plansRoot(organizationId)}/${encodeURIComponent(planId)}`, { method: "PATCH", body: JSON.stringify(input), headers: { "If-Match": etag, "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { mapError(e); } },
  getProfile: async (organizationId: string, signal?: AbortSignal) => { try { return assertProfile(await organizationApiFetch(organizationId, `${root(organizationId)}/profile`, { signal })); } catch (e) { mapError(e); } },
  replaceProfile: async (organizationId: string, profile: Pick<PlanningProfile, "planningMode" | "preferences">, etag: string, signal?: AbortSignal) => { try { return assertProfile(await organizationApiFetch(organizationId, `${root(organizationId)}/profile`, { method: "PUT", body: JSON.stringify(profile), headers: { "If-Match": etag, "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { mapError(e); } },
}), [organizationApiFetch]); };
