import { describe, expect, it } from "vitest";
import type { AuthorizationUiDecision } from "./api";
import { resolveAuthorizationTreatment } from "./authorization";

const statuses = ["ready", "loading", "stale", "unavailable"] as const;
const finalDecisions = ["allow", "deny", "unresolved"] as const;
const treatments = ["hide", "disable", "filter", "block", "explain"] as const;

const decision = (status: string, finalDecision: string, treatment: string, dataAccessMode?: string, scopeAppliedByBackend?: boolean) => ({
  decisionId: "decision-1", status, finalDecision, treatment,
  dataAccessMode: dataAccessMode ?? (finalDecision === "allow" ? (treatment === "filter" ? "scoped" : "full") : "none"),
  scopeAppliedByBackend: scopeAppliedByBackend ?? (finalDecision === "allow" && treatment === "filter"),
  terminalStage: "runtime", terminalReasonCode: "test", evaluatedStages: [], subjectId: "subject-1",
  organizationId: "organization-1", actionId: "organizationModel.readPublished",
  authorizationSnapshotVersion: "snapshot-1",
}) as AuthorizationUiDecision;

describe("authorization treatment truth table", () => {
  for (const status of statuses) for (const finalDecision of finalDecisions) for (const treatment of treatments) {
    it(`${status} + ${finalDecision} + ${treatment}`, () => {
      const result = resolveAuthorizationTreatment(decision(status, finalDecision, treatment));
      if (status !== "ready" || finalDecision === "unresolved") {
        expect(result).toMatchObject({ treatment: "block", executable: false, queryable: false });
      } else if (finalDecision === "deny" && treatment === "hide") {
        expect(result).toMatchObject({ treatment: "hide", render: false, executable: false });
      } else if (finalDecision === "deny" && treatment === "disable") {
        expect(result).toMatchObject({ treatment: "disable", render: true, executable: false });
      } else if (finalDecision === "deny" && treatment === "block") {
        expect(result).toMatchObject({ treatment: "block", executable: false });
      } else if (finalDecision === "allow" && treatment === "filter") {
        expect(result).toMatchObject({ treatment: "filter", queryable: true, executable: false });
      } else if (finalDecision === "allow" && treatment === "explain") {
        expect(result).toMatchObject({ treatment: "explain", queryable: true, executable: true, diagnostics: false });
      } else {
        expect(result).toMatchObject({ treatment: "block", executable: false, queryable: false });
      }
    });
  }

  it.each([
    ["allow + disable", decision("ready", "allow", "disable")],
    ["deny + filter", decision("ready", "deny", "filter")],
    ["unresolved decision", decision("ready", "unresolved", "explain")],
    ["stale decision", decision("stale", "allow", "explain")],
    ["unknown treatment", decision("ready", "allow", "launch")],
    ["unscoped filter", decision("ready", "allow", "filter", "scoped", false)],
    ["deny with data", decision("ready", "deny", "disable", "full", false)],
  ])("fails closed for malformed %s", (_name, malformed) => {
    expect(resolveAuthorizationTreatment(malformed)).toMatchObject({ treatment: "block", executable: false, queryable: false });
  });

  it("exposes explain diagnostics only on an explicitly authorized diagnostic surface", () => {
    const explain = decision("ready", "allow", "explain");
    expect(resolveAuthorizationTreatment(explain).diagnostics).toBe(false);
    expect(resolveAuthorizationTreatment(explain, true).diagnostics).toBe(true);
  });
});
