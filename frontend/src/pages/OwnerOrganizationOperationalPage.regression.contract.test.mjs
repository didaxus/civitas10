import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const source = readFileSync(new URL("./OwnerOrganizationOperationalPage.tsx", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App/index.tsx", import.meta.url), "utf8");
const directorySource = readFileSync(new URL("./OwnerOrganizationsIndexPage.tsx", import.meta.url), "utf8");
const governanceSource = readFileSync(new URL("../features/governance/GovernanceStudioPage.tsx", import.meta.url), "utf8");

test("organization detail uses a closed async state and normalized errors", () => {
  assert.match(source, /type OrganizationDetailState =/);
  assert.match(source, /\| \{ status: "error"; error: AppErrorPresentation \}/);
  assert.doesNotMatch(source, /error!|as AppError/);
  assert.match(source, /toAppErrorPresentation\(caught\)/);
  assert.match(source, /OWNER_ORGANIZATION_CONTRACT_ERROR/);
});

test("invalid, literal and encoded organization id placeholders render not found before querying", () => {
  assert.match(source, /isInvalidOrganizationId/);
  assert.match(source, /decodeURIComponent\(id\)/);
  assert.match(source, /decoded === `:\$\{"organizationId"\}`/);
  assert.match(source, /setState\(\{ status: "not-found", organizationId \}\)/);
});

test("http states are mapped explicitly", () => {
  assert.match(source, /caught instanceof ApiRequestError && caught\.status === 404/);
  assert.match(source, /error\.status === 401 \|\| error\.status === 403/);
  assert.match(source, /status: "denied"/);
});

test("organization detail routes share one parent shell boundary", () => {
  assert.match(appSource, /OwnerOrganizationShellRoute/);
  assert.match(appSource, /OwnerOrganizationLayout/);
  assert.doesNotMatch(source, /OwnerShell|OwnerLayout|AppShell/);
});

test("directory cards preserve the real organization id", () => {
  assert.match(directorySource, /ownerOrganizationState\.build/);
  assert.match(directorySource, /organizationId: summary\.id/);
  assert.doesNotMatch(governanceSource, /GovernanceLegacy|LEGACY_TAB/);
});
