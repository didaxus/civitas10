import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workspace = readFileSync(new URL("../features/governance/governance-workspace-contract.ts", import.meta.url), "utf8");
const navigation = readFileSync(new URL("./materialize-navigation.ts", import.meta.url), "utf8");
const routes = readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const app = readFileSync(new URL("../pages/App/index.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../layouts/AppShell.tsx", import.meta.url), "utf8");
const nav = readFileSync(new URL("../shared/ui/NavCollapse.tsx", import.meta.url), "utf8");
const studio = readFileSync(new URL("../features/governance/GovernanceStudioPage.tsx", import.meta.url), "utf8");

test("organization workspace materializes one Spanish hierarchy with eight governance leaves", () => {
  for (const label of ["Volver al directorio", "Gobierno", "Política de acceso", "Modelo de organización", "Control y evidencia"]) assert.match(navigation + routes + workspace, new RegExp(label));
  assert.match(navigation, /item\.id !== "identity-provisioning"/);
  assert.match(navigation, /group\.id !== "operations"/);
  assert.doesNotMatch(studio, /WorkspaceShell|GovernanceSectionNav|SettingsWorkbench/);
  assert.equal((shell.match(/<aside/g) || []).length, 1);
});

test("canonical governance routes and query-preserving legacy redirects are explicit", () => {
  for (const path of ["access-policy/roles", "access-policy/role-names", "access-policy/scope-assignments", "organization-model/structure", "organization-model/groups", "organization-model/segments", "control/access-explorer", "control/audit"]) assert.match(routes, new RegExp(path));
  assert.match(app, /`\$\{to\(organizationId\)\}\$\{search\}`/);
  assert.match(app, /governance\/groups/);
  assert.match(app, /governance\/data-scopes/);
});

test("tree groups and mobile drawer expose accessible state", () => {
  assert.match(nav, /aria-expanded=\{expanded\}/);
  assert.match(nav, /aria-controls=\{panelId\}/);
  assert.match(nav, /aria-current=\{active \? "page"/);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /onNavigate=\{\(\) => setMobileOpen\(false\)\}/);
});
