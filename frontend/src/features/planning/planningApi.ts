import { useMemo } from "react";
import { useApi, ApiRequestError } from "../../api/base";

export type PlanningPlanStatus = "draft" | "in_review" | "changes_requested" | "approved" | "archived";
export type PlanningPlanType = "strategic" | "tactical" | "operational" | "project" | "curriculum";
export type PlanningPlan = { id: string; title: string; planType: PlanningPlanType; description: string | null; status: PlanningPlanStatus; version: string; updatedAt: string };
export type PlanningProfile = { organizationId: string; planningMode: "standard" | "curriculum" | "strategic"; preferences: { fiscalYearStart?: string }; version: string; updatedAt: string };
export type PlanningListResponse = { data: PlanningPlan[]; page: { nextCursor: string | null; hasMore: boolean }; links: Record<string, unknown>; meta: Record<string, unknown> };
export type PlanningPlanInput = { title: string; planType?: PlanningPlanType; description?: string | null };
export type PlanningProblemCode = "validation" | "precondition_failed" | "conflict" | "module_unavailable" | "module_incompatible" | "authorization_context" | "archived" | "stale" | string;
export class PlanningApiError extends Error { constructor(message: string, public status?: number, public code?: PlanningProblemCode, public details?: unknown) { super(message); this.name = "PlanningApiError"; } }

const root = (organizationId: string) => `/api/v1/o/${encodeURIComponent(organizationId)}/planning`;
/** Query keys are deliberately tenant scoped. Never add an unscoped Planning key. */
export const planningCacheKeys = {
  plans: (organizationId: string) => ["planning", organizationId, "plans"] as const,
  plan: (organizationId: string, planId: string) => ["planning", organizationId, "plan", planId] as const,
  profile: (organizationId: string) => ["planning", organizationId, "profile"] as const,
};
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const planStatuses = new Set<PlanningPlanStatus>(["draft", "in_review", "changes_requested", "approved", "archived"]);
const planTypes = new Set<PlanningPlanType>(["strategic", "tactical", "operational", "project", "curriculum"]);
const planningModes = new Set<PlanningProfile["planningMode"]>(["standard", "curriculum", "strategic"]);
const contractError = (resource: string): never => { throw new PlanningApiError(`Planning ${resource} contract failed`, 502, "contract_invalid"); };
const assertPlanData = (value: unknown): PlanningPlan => {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || !planTypes.has(value.planType as PlanningPlanType) || !planStatuses.has(value.status as PlanningPlanStatus) || typeof value.version !== "string" || typeof value.updatedAt !== "string" || !(value.description === null || typeof value.description === "string")) return contractError("plan");
  return value as PlanningPlan;
};
const assertPlan = (value: unknown): PlanningPlan => {
  if (!isRecord(value) || !isRecord(value.data)) return contractError("plan envelope");
  return assertPlanData(value.data);
};
const assertList = (value: unknown): PlanningListResponse => {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.page) || !(value.page.nextCursor === null || typeof value.page.nextCursor === "string") || typeof value.page.hasMore !== "boolean" || !isRecord(value.links) || !isRecord(value.meta)) return contractError("list");
  return { data: value.data.map(assertPlanData), page: value.page as PlanningListResponse["page"], links: value.links, meta: value.meta };
};
const assertProfile = (value: unknown): PlanningProfile => {
  if (!isRecord(value) || !isRecord(value.data)) return contractError("profile envelope");
  const profile = value.data;
  if (typeof profile.organizationId !== "string" || !planningModes.has(profile.planningMode as PlanningProfile["planningMode"]) || !isRecord(profile.preferences) || typeof profile.version !== "string" || typeof profile.updatedAt !== "string" || !(profile.preferences.fiscalYearStart === undefined || typeof profile.preferences.fiscalYearStart === "string")) return contractError("profile");
  return profile as PlanningProfile;
};
const mapError = (error: unknown): never => { if (error instanceof PlanningApiError) throw error; if (error instanceof ApiRequestError) throw new PlanningApiError(error.message, error.status, error.code, error.details); throw new PlanningApiError(error instanceof Error ? error.message : String(error)); };

type OrganizationApiFetch = (organizationId: string, endpoint: string, options?: RequestInit) => Promise<unknown>;
export const createPlanningApi = (organizationApiFetch: OrganizationApiFetch) => ({
  listPlans: async (organizationId: string, signal?: AbortSignal) => { try { return assertList(await organizationApiFetch(organizationId, `${root(organizationId)}/plans`, { signal })); } catch (e) { return mapError(e); } },
  readPlan: async (organizationId: string, planId: string, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${root(organizationId)}/plans/${encodeURIComponent(planId)}`, { signal })); } catch (e) { return mapError(e); } },
  createPlan: async (organizationId: string, input: PlanningPlanInput, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${root(organizationId)}/plans`, { method: "POST", body: JSON.stringify(input), headers: { "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { return mapError(e); } },
  updatePlan: async (organizationId: string, planId: string, input: PlanningPlanInput, etag: string, signal?: AbortSignal) => { try { return assertPlan(await organizationApiFetch(organizationId, `${root(organizationId)}/plans/${encodeURIComponent(planId)}`, { method: "PATCH", body: JSON.stringify(input), headers: { "If-Match": etag, "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { return mapError(e); } },
  getProfile: async (organizationId: string, signal?: AbortSignal) => { try { return assertProfile(await organizationApiFetch(organizationId, `${root(organizationId)}/profile`, { signal })); } catch (e) { return mapError(e); } },
  replaceProfile: async (organizationId: string, profile: Pick<PlanningProfile, "planningMode" | "preferences">, etag: string, signal?: AbortSignal) => { try { return assertProfile(await organizationApiFetch(organizationId, `${root(organizationId)}/profile`, { method: "PUT", body: JSON.stringify(profile), headers: { "If-Match": etag, "Idempotency-Key": crypto.randomUUID() }, signal })); } catch (e) { return mapError(e); } },
});
export const usePlanningApi = () => {
  const { organizationApiFetch } = useApi();
  return useMemo(() => createPlanningApi(organizationApiFetch), [organizationApiFetch]);
};
