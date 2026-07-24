import { useMemo } from "react";
import { useApi, ApiRequestError } from "../../api/base";

export type PlanningPlanStatus = "draft" | "active" | "archived";
export type PlanningPlan = { planId: string; organizationId: string; title: string; description?: string; status: PlanningPlanStatus; version: string; updatedAt?: string; etag?: string };
export type PlanningProfile = { organizationId: string; planningMode: string; preferences?: Record<string, unknown>; version: string };
export type PlanningListResponse = { items: PlanningPlan[]; page?: { limit?: number; cursor?: string } };
export type PlanningPlanInput = { title: string; description?: string; status?: PlanningPlanStatus };
export type PlanningProblemCode = "validation" | "precondition_failed" | "conflict" | "module_unavailable" | "module_incompatible" | "authorization_context" | "archived" | "stale" | string;
export class PlanningApiError extends Error { constructor(message: string, public status?: number, public code?: PlanningProblemCode, public details?: unknown) { super(message); this.name = "PlanningApiError"; } }

const root = (organizationId: string) => `/api/v1/o/${encodeURIComponent(organizationId)}/planning`;
const assertPlan = (value: unknown): PlanningPlan => { const plan = (value as { result?: unknown; plan?: unknown })?.result ?? (value as { plan?: unknown })?.plan ?? value; if (!plan || typeof plan !== "object" || typeof (plan as PlanningPlan).planId !== "string" || typeof (plan as PlanningPlan).title !== "string") throw new PlanningApiError("Planning plan contract failed", 502, "contract_invalid"); return plan as PlanningPlan; };
const assertList = (value: unknown): PlanningListResponse => { const result = (value as { result?: unknown })?.result ?? value; if (!result || typeof result !== "object" || !Array.isArray((result as PlanningListResponse).items)) throw new PlanningApiError("Planning list contract failed", 502, "contract_invalid"); return result as PlanningListResponse; };
const assertProfile = (value: unknown): PlanningProfile => { const profile = (value as { result?: unknown; profile?: unknown })?.result ?? (value as { profile?: unknown })?.profile ?? value; if (!profile || typeof profile !== "object" || typeof (profile as PlanningProfile).organizationId !== "string") throw new PlanningApiError("Planning profile contract failed", 502, "contract_invalid"); return profile as PlanningProfile; };
const mapError = (error: unknown): never => { if (error instanceof PlanningApiError) throw error; if (error instanceof ApiRequestError) throw new PlanningApiError(error.message, error.status, error.code, error.details); throw new PlanningApiError(error instanceof Error ? error.message : String(error)); };

export const usePlanningApi = () => { const { organizationApiFetch } = useApi(); return useMemo(() => ({
  listPlans: async (organizationId: string, signal?: AbortSignal) => { try { return assertList(await organizationApiFetch(organizationId, root(organizationId), { signal })); } catch (e) { mapError(e); } },
  getPlan: async (organizationId: string, planId: string, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${root(organizationId)}/${encodeURIComponent(planId)}`, { signal })); } catch (e) { mapError(e); } },
  createPlan: async (organizationId: string, input: PlanningPlanInput, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, root(organizationId), { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { mapError(e); } },
  updatePlan: async (organizationId: string, planId: string, input: PlanningPlanInput, etag: string, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${root(organizationId)}/${encodeURIComponent(planId)}`, { method: "PUT", body: JSON.stringify(input), headers: { "If-Match": etag, "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { mapError(e); } },
  archivePlan: async (organizationId: string, planId: string, etag: string, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${root(organizationId)}/${encodeURIComponent(planId)}/archive`, { method: "POST", headers: { "If-Match": etag, "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { mapError(e); } },
  getProfile: async (organizationId: string, signal?: AbortSignal) => { try { return assertProfile(await organizationApiFetch(organizationId, `${root(organizationId)}/profile`, { signal })); } catch (e) { mapError(e); } },
  upsertProfile: async (organizationId: string, profile: Partial<PlanningProfile>, signal?: AbortSignal) => { try { return assertProfile(await organizationApiFetch(organizationId, `${root(organizationId)}/profile`, { method: "PUT", body: JSON.stringify(profile), headers: { "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { mapError(e); } },
}), [organizationApiFetch]); };
