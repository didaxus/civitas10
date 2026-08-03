import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const ownerUi = readFileSync(new URL("../components/owner/OwnerUI.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
const overview = readFileSync(new URL("./OwnerOperationalHomePage.tsx", import.meta.url), "utf8");
const create = readFileSync(new URL("./OwnerOrganizationsPage.tsx", import.meta.url), "utf8");
const runtime = readFileSync(new URL("./OwnerWorkerQueuesPage.tsx", import.meta.url), "utf8");
const operational = readFileSync(new URL("./OwnerOrganizationOperationalPage.tsx", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../../package.json", import.meta.url), "utf8");

test("owner visual layer defines a stable shell and reusable primitives", () => {
  for (const component of ["OwnerShell", "PageHeader", "SectionCard", "MetricCard", "StatusBanner", "EmptyState", "LoadingState", "ErrorState", "ActionBar"]) {
    assert.match(ownerUi, new RegExp(`export const ${component}`));
  }
});

test("organization child pages do not render a second shell", () => {
  assert.doesNotMatch(operational, /<OwnerShell|<OwnerLayout|<AppShell|<nav/);
  for (const source of [overview, create, runtime]) assert.doesNotMatch(source, /<Topbar/);
});

test("critical owner styles live in component CSS and are validated after build", () => {
  for (const selector of [".owner-shell", ".owner-topbar", ".owner-primary-nav", ".owner-card", ".owner-field"]) {
    assert.match(css, new RegExp(selector.replace(".", "\\.")));
  }
  assert.match(packageJson, /validate-civitas-visual\.mjs/);
});
