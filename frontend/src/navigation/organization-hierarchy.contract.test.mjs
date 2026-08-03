import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const routes = fs.readFileSync(new URL("./routes.ts", import.meta.url), "utf8");
const navigation = fs.readFileSync(new URL("./materialize-navigation.ts", import.meta.url), "utf8");
const adapter = fs.readFileSync(new URL("./nav-item-adapter.ts", import.meta.url), "utf8");

test("organization workspace materializes the canonical English hierarchy", () => {
  for (const label of ["Back to Directory", "Overview", "Governance", "Members", "Operations"]) assert.match(navigation + routes, new RegExp(label));
  assert.match(navigation, /GOVERNANCE_WORKSPACE_ITEMS/);
  assert.doesNotMatch(navigation, /status:|Groups & Classes|Identity Provisioning|Volver|Gobierno/);
});

test("canonical governance routes have no compatibility aliases", () => {
  assert.match(routes, /access-policy\/roles/);
  assert.match(routes, /organization-model\/segments/);
  assert.doesNotMatch(routes, /Legacy|governance\/groups|governance\/preview/);
});

test("contextual return is route-backed and never active", () => {
  assert.match(navigation, /iconKey: "back", contextual: true/);
  assert.match(adapter, /item\.contextual \? \(\) => false/);
});
