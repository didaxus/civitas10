const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const stackDoc = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "identity-federation", "pr-stack.md"), "utf8");

test("identity federation PR stack preserves the required layer order", () => {
  const requiredOrder = [
    "discovery-conformance-ingress",
    "persistence-credential-foundations",
    "users-lifecycle",
    "groups-lifecycle",
    "group-to-role-mapping",
    "seat-capacity-integration",
    "reconciliation-operation-ledger-integration",
    "governance-ui",
    "production-readiness-entra-security-retry-two-tenant-history-observability-runbooks",
  ];

  let previousIndex = -1;
  for (const layer of requiredOrder) {
    const index = stackDoc.indexOf(layer);
    assert.ok(index > previousIndex, `${layer} must appear after the previous stack layer`);
    previousIndex = index;
  }

  assert.match(stackDoc, /first PR is based on the PR #144 modular architecture branch/i);
  assert.match(stackDoc, /PRs 2-9 must target the updated `main` after #144 merges/);
});

test("issue #155 remains only the SCIM child of issue #154", () => {
  assert.match(stackDoc, /Issue #154 is the parent Organization Identity Federation implementation track/);
  assert.match(stackDoc, /Issue #155 is only the SCIM child of #154/);
  assert.match(stackDoc, /not authentication/);
  assert.match(stackDoc, /not a Logto fork/);
});
