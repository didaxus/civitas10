import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { Banner, PlanDetail, PlanForm, PlanningBundleFailureFallback, ProfileForm } from "./PlanningRemote";
import { PlanningApiError, type PlanningPlan, type PlanningProfile } from "./planningApi";

const plan: PlanningPlan = { planId: "plan-1", organizationId: "org-1", title: "Annual plan", status: "archived", version: "v3" };
const profile: PlanningProfile = { organizationId: "org-1", planningMode: "strategic", preferences: { fiscalYearStart: "2026-07-01" }, version: "v2" };
const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);

describe("Planning remote states", () => {
  it("renders concurrency conflicts as actionable alerts", () => {
    const html = render(<Banner error={new PlanningApiError("stale", 412)} />);
    expect(html).toContain("Someone else updated");
    expect(html).toContain('role="alert"');
  });

  it("disables plan writes in degraded mode and archived details", () => {
    expect(render(<PlanForm readOnly onSubmit={vi.fn()} />)).toContain("disabled");
    const html = render(<PlanDetail organizationId="org-1" plan={plan} edit readOnly onSubmit={vi.fn()} />);
    expect(html).toContain("disabled");
    expect(html).not.toContain("Edit plan");
  });

  it("renders and disables the real profile fields when read-only", () => {
    const html = render(<ProfileForm profile={profile} readOnly onSubmit={vi.fn()} />);
    expect(html).toContain("Strategic");
    expect(html).toContain("2026-07-01");
    expect(html).toContain("disabled");
  });

  it("keeps an accessible shell fallback when the bundle fails", () => {
    const html = render(<PlanningBundleFailureFallback />);
    expect(html).toContain("kept the shell available");
    expect(html).toContain('role="alert"');
  });
});
