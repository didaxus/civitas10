// @vitest-environment jsdom
import { act, lazy } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModuleUiRouteBoundary } from "../loader/ModuleUiRouteBoundary";
import { planningRemoteUiContribution } from "../../features/planning/planningRemoteUiContribution";
import { resolveModuleMountDecision } from "./moduleMountDecision";
import { AppRuntimeErrorBoundary } from "../../pages/App/AppRuntimeErrorBoundary";

let container: HTMLDivElement;
let root: Root;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe("remote module startup isolation", () => {
  it("returns a typed non-mountable decision for planned contributions", () => {
    expect(resolveModuleMountDecision(planningRemoteUiContribution)).toEqual({ mountable: false, status: "planned", reason: "planned_contribution_not_mountable", contribution: null });
  });

  it("imports the global App without adapting the planned Planning contribution", async () => {
    await expect(import("../../pages/App")).resolves.toHaveProperty("default");
  });

  it("keeps the React root mounted when a lazy module import rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const BrokenModule = lazy(() => Promise.reject(new Error("planned_contribution_not_mountable")));
    await act(async () => { root.render(<div data-testid="shell">AppShell<ModuleUiRouteBoundary moduleId="planning"><BrokenModule /></ModuleUiRouteBoundary></div>); });
    expect(container.textContent).toContain("AppShell");
    expect(container.textContent).toContain("Planning is not currently available.");
    expect(container.innerHTML).not.toBe("");
  });

  it("renders the controlled fallback when the lazy Planning contribution is planned", async () => {
    const modulePromise = import("../../features/planning/PlanningModuleRoute");
    const PlanningModule = lazy(() => modulePromise);
    await act(async () => { root.render(<div data-testid="shell">AppShell<ModuleUiRouteBoundary moduleId="planning"><PlanningModule /></ModuleUiRouteBoundary></div>); });
    await act(async () => { await modulePromise; });
    expect(container.textContent).toContain("AppShell");
    expect(container.textContent).toContain("Planning is not currently available.");
  });

  it("renders a non-technical root recovery screen for unexpected App failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const BrokenApp = () => { throw new Error("secret technical stack"); };
    await act(async () => { root.render(<AppRuntimeErrorBoundary><BrokenApp /></AppRuntimeErrorBoundary>); });
    expect(container.textContent).toContain("Civitas could not display this page");
    expect(container.textContent).toContain("Error reference:");
    expect(container.textContent).not.toContain("secret technical stack");
    expect(container.querySelector("button")?.textContent).toBe("Reload");
    expect(container.querySelector('a[href="/"]')?.textContent).toBe("Go to home");
  });
});
