"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  DIMENSION_REGISTRY_SCHEMA_VERSION,
  DIMENSION_REGISTRY_CONTRACT_VERSION,
  REGISTRY_ERROR_CODES,
  loadDimensionRegistry,
} = require("../taxonomy/taxonomyDimensionRegistry");

const fixtures = path.join(__dirname, "fixtures/taxonomy-dimension-registry");
const fixture = (name) => path.join(fixtures, name);
const backendSmokeEnv = {
  ...process.env,
  NODE_ENV: "test",
  API_URL: "https://civitas.didaxus.com/api",
  DATABASE_URL: "postgresql://civitas:test@localhost:5432/civitas",
  REDIS_URL: "redis://localhost:6379/0",
  LOGTO_API_RESOURCE: "https://civitas.didaxus.com/api",
  LOGTO_MANAGEMENT_API_RESOURCE: "https://auth.didaxus.com/api",
  LOGTO_M2M_CLIENT_ID: "smoke-test",
  LOGTO_M2M_CLIENT_SECRET: "smoke-test",
};
const rejectsWithCode = (name, code) => {
  assert.throws(() => loadDimensionRegistry(fixture(name)), (error) => {
    assert.equal(error.name, "TaxonomyDimensionRegistryError");
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    return true;
  });
};

test("loads the exact current data-scope dimensions v2 document", () => {
  const registry = loadDimensionRegistry(fixture("current-v2.yaml"));
  assert.equal(registry.schemaVersion, DIMENSION_REGISTRY_SCHEMA_VERSION);
  assert.equal(registry.contractVersion, DIMENSION_REGISTRY_CONTRACT_VERSION);
  assert.equal(registry.dimensions.length, 10);
});

test("reports a stable error for a missing registry file", () => {
  rejectsWithCode("file-missing.yaml", REGISTRY_ERROR_CODES.FILE_MISSING);
});

test("reports a stable error for malformed JSON/YAML", () => {
  rejectsWithCode("malformed.yaml", REGISTRY_ERROR_CODES.MALFORMED);
});

test("reports a stable error when full JSON Schema validation fails", () => {
  rejectsWithCode("schema-invalid.yaml", REGISTRY_ERROR_CODES.SCHEMA_INVALID);
});

test("explicitly rejects an invalid schemaVersion", () => {
  rejectsWithCode("schema-version-invalid.yaml", REGISTRY_ERROR_CODES.SCHEMA_INVALID);
});

test("reports a stable error for an incompatible contractVersion", () => {
  rejectsWithCode("contract-version-incompatible.yaml", REGISTRY_ERROR_CODES.CONTRACT_VERSION_INCOMPATIBLE);
});

test("reports a stable error when dimensions are absent", () => {
  rejectsWithCode("dimensions-missing.yaml", REGISTRY_ERROR_CODES.DIMENSIONS_MISSING);
});

test("reports a stable error for duplicate dimension IDs", () => {
  rejectsWithCode("dimension-ids-duplicated.yaml", REGISTRY_ERROR_CODES.DIMENSION_IDS_DUPLICATED);
});

for (const entrypoint of ["taxonomy/index.js", "index.js"]) {
  test(`isolated smoke load of backend/${entrypoint} does not open a listener`, () => {
    const script = `require("node:net").Server.prototype.listen = function () { throw new Error("listener_opened") }; require(${JSON.stringify(path.join(__dirname, "..", entrypoint))})`;
    const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000, env: backendSmokeEnv });
    assert.equal(result.signal, null, result.stderr);
    assert.equal(result.status, 0, result.stderr);
  });
}
