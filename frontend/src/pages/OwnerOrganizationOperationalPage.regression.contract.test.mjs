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

test("organization detail routes are isolated by a route boundary below the app shell", () => {
  assert.match(appSource, /OwnerOrganizationRouteBoundary/);
  assert.match(appSource, /path=\{appRoutes\.ownerOrganizationState\.path\} element=\{<OwnerRouteGuard><OwnerOrganizationContextRoute>/);
  assert.match(appSource, /path=\{appRoutes\.ownerOrganizationGovernanceRoles\.path\} element=\{<OwnerRouteGuard><OwnerOrganizationContextRoute>/);
});

test("directory cards and governance links preserve the real organization id", () => {
  assert.match(directorySource, /appRoutes\.ownerOrganizationState\.build\?\.\(\{ organizationId: summary\.id \}\)/);
  assert.doesNotMatch(directorySource, /Open detail/);
  assert.match(governanceSource, /appRoutes\.ownerOrganizationState\.build\?\.\(\{ organizationId \}\)/);
});
