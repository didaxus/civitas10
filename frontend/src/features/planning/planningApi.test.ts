import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../api/base", () => ({
  ApiRequestError: class ApiRequestError extends Error {},
  useApi: vi.fn(),
}));

import { createPlanningApi, PlanningApiError } from "./planningApi";

const fetcher = vi.fn();
const plan = { id: "plan-1", title: "Plan", planType: "curriculum", description: null, status: "draft", version: "v1", updatedAt: "2026-07-01T00:00:00Z" };
const profile = { organizationId: "org-1", planningMode: "standard", preferences: { fiscalYearStart: "07-01" }, version: "v1", updatedAt: "2026-07-01T00:00:00Z" };

beforeEach(() => fetcher.mockReset());

describe("Planning typed HTTP client", () => {
  it("executes list and create against the canonical collection", async () => {
    const client = createPlanningApi(fetcher);
    fetcher.mockResolvedValueOnce({ data: [plan], page: { nextCursor: null, hasMore: false }, links: {}, meta: {} });
    await client.listPlans("org-1");
    expect(fetcher).toHaveBeenLastCalledWith("org-1", "/api/v1/o/org-1/planning/plans", { signal: undefined });

    fetcher.mockResolvedValueOnce({ data: plan, meta: {} });
    await client.createPlan("org-1", { title: "Plan", planType: "curriculum" });
    expect(fetcher).toHaveBeenLastCalledWith("org-1", "/api/v1/o/org-1/planning/plans", expect.objectContaining({ method: "POST" }));
  });

  it("executes read and PATCH update by canonical id with If-Match", async () => {
    const client = createPlanningApi(fetcher);
    fetcher.mockResolvedValue({ data: plan, meta: {} });
    await client.readPlan("org-1", "plan/1");
    expect(fetcher).toHaveBeenLastCalledWith("org-1", "/api/v1/o/org-1/planning/plans/plan%2F1", { signal: undefined });
    await client.updatePlan("org-1", "plan-1", { title: "Updated" }, "v1");
    expect(fetcher).toHaveBeenLastCalledWith("org-1", "/api/v1/o/org-1/planning/plans/plan-1", expect.objectContaining({ method: "PATCH", headers: expect.objectContaining({ "If-Match": "v1" }) }));
  });

  it("executes profile read/replace and rejects malformed public DTOs", async () => {
    const client = createPlanningApi(fetcher);
    fetcher.mockResolvedValue({ data: profile, meta: {} });
    await client.getProfile("org-1");
    expect(fetcher).toHaveBeenLastCalledWith("org-1", "/api/v1/o/org-1/planning/profile", { signal: undefined });
    await client.replaceProfile("org-1", { planningMode: "standard", preferences: {} }, "v1");
    expect(fetcher).toHaveBeenLastCalledWith("org-1", "/api/v1/o/org-1/planning/profile", expect.objectContaining({ method: "PUT", headers: expect.objectContaining({ "If-Match": "v1" }) }));

    fetcher.mockResolvedValueOnce({ data: { planId: "persistence-alias", title: "Leaked alias" }, meta: {} });
    await expect(client.readPlan("org-1", "plan-1")).rejects.toBeInstanceOf(PlanningApiError);
  });
});
