// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listPlans: vi.fn(),
  readPlan: vi.fn(),
  createPlan: vi.fn(),
  updatePlan: vi.fn(),
  getProfile: vi.fn(),
  replaceProfile: vi.fn(),
}));

vi.mock("./planningApi", () => ({
  PlanningApiError: class PlanningApiError extends Error {
    constructor(message: string, public status?: number, public code?: string) { super(message); }
  },
  usePlanningApi: () => api,
}));

import { PlanningRemoteScreen } from "./PlanningRemote";
import { PlanningApiError, type PlanningPlan, type PlanningProfile } from "./planningApi";

const plan: PlanningPlan = { id: "plan-1", title: "Annual plan", planType: "curriculum", description: "Current description", status: "draft", version: "v3", updatedAt: "2026-07-01T00:00:00Z" };
const profile: PlanningProfile = { organizationId: "org-1", planningMode: "strategic", preferences: { fiscalYearStart: "07-01" }, version: "v2", updatedAt: "2026-07-01T00:00:00Z" };
let container: HTMLDivElement;
let root: Root;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Location = () => <output data-testid="location">{useLocation().pathname}</output>;
const render = async (node: ReactNode, initialEntry = "/") => {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[initialEntry]}><Routes><Route path="*" element={<>{node}<Location /></>} /></Routes></MemoryRouter>);
  });
};
const change = (selector: string, value: string) => {
  const input = container.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!;
  const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
};
const submit = async () => { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); }); };

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  api.listPlans.mockReset().mockResolvedValue({ data: [], page: { nextCursor: null, hasMore: false }, links: {}, meta: {} });
  api.readPlan.mockReset().mockResolvedValue(plan);
  api.createPlan.mockReset().mockResolvedValue(plan);
  api.updatePlan.mockReset().mockResolvedValue({ ...plan, title: "Updated", version: "v4" });
  api.getProfile.mockReset().mockResolvedValue(profile);
  api.replaceProfile.mockReset().mockResolvedValue({ ...profile, version: "v3" });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

describe("Planning remote integration", () => {
  it("creates through the typed client and navigates to the returned detail", async () => {
    await render(<PlanningRemoteScreen organizationId="org-1" screen="create" availability="available" access="allowed" canCreate />);
    await act(async () => change("#planning-title-input", "New curriculum"));
    await submit();
    expect(api.createPlan).toHaveBeenCalledWith("org-1", expect.objectContaining({ title: "New curriculum", planType: "curriculum" }));
    expect(container.querySelector('[data-testid="location"]')?.textContent).toBe("/o/org-1/planning/plans/plan-1");
  });

  it("aborts the previous organization request and clears its result", async () => {
    const signals: AbortSignal[] = [];
    api.listPlans.mockImplementation((_organizationId: string, signal: AbortSignal) => { signals.push(signal); return new Promise(() => undefined); });
    await render(<PlanningRemoteScreen organizationId="org-1" screen="list" access="allowed" />);
    await render(<PlanningRemoteScreen organizationId="org-2" screen="list" access="allowed" />);
    expect(signals[0]?.aborted).toBe(true);
    expect(container.textContent).not.toContain("Annual plan");
  });

  it("updates a plan with its current version and retains the updated response", async () => {
    await render(<PlanningRemoteScreen organizationId="org-1" screen="edit" planId="plan-1" access="allowed" canUpdate />);
    await act(async () => change("#planning-title-input", "Updated"));
    await submit();
    expect(api.updatePlan).toHaveBeenCalledWith("org-1", "plan-1", expect.objectContaining({ title: "Updated" }), "v3");
    expect((container.querySelector("#planning-title-input") as HTMLInputElement).value).toBe("Updated");
  });

  it("replaces the profile with If-Match version and presents stale conflicts", async () => {
    api.replaceProfile.mockRejectedValueOnce(new PlanningApiError("stale", 412));
    await render(<PlanningRemoteScreen organizationId="org-1" screen="profile" access="allowed" canReplaceProfile />);
    await act(async () => change("#fiscal-year-start", "08-01"));
    await submit();
    expect(api.replaceProfile).toHaveBeenCalledWith("org-1", expect.objectContaining({ preferences: { fiscalYearStart: "08-01" } }), "v2");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Someone else updated");
  });

  it("derives write availability from host action decisions", async () => {
    await render(<PlanningRemoteScreen organizationId="org-1" screen="profile" access="allowed" canReplaceProfile={false} />);
    expect((container.querySelector("#planning-mode") as HTMLSelectElement).disabled).toBe(true);
    expect((container.querySelector("button[type=submit]") as HTMLButtonElement).disabled).toBe(true);
  });
});
