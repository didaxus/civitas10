"use strict";
const fs = require("node:fs");
const path = require("node:path");
const REGISTRY_PATH = path.resolve(__dirname, "../../contracts/authorization/data-scope-dimensions.yaml");
const DIMENSION_REGISTRY_CONTRACT = "civitas.authorization.data-scope-dimensions";
const CANONICAL_DIMENSION_IDS = Object.freeze([
  "academic.stage", "academic.period", "academic.subject", "academic.course", "academic.cohort", "academic.class",
  "organization.campus", "organization.shift", "organization.department", "administration.function",
]);

function invalidRegistry() { throw new Error("taxonomy_dimension_registry_invalid"); }

function validateDimensionRegistry(registry) {
  if (!registry || registry.contract !== DIMENSION_REGISTRY_CONTRACT || typeof registry.version !== "string" || !registry.version.trim() || !Array.isArray(registry.dimensions)) invalidRegistry();
  const ids = registry.dimensions.map((dimension) => dimension && dimension.id);
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) invalidRegistry();
  if (ids.length !== CANONICAL_DIMENSION_IDS.length || ids.some((id, index) => id !== CANONICAL_DIMENSION_IDS[index])) invalidRegistry();
  for (const dimension of registry.dimensions) {
    const fields = Object.keys(dimension);
    if (fields.some((field) => /(^|_)(permission|role|assignment|scope)(_|$)/i.test(field))) invalidRegistry();
  }
  return registry;
}

function loadDimensionRegistry(file = REGISTRY_PATH) {
  const registry = JSON.parse(fs.readFileSync(file, "utf8")); // JSON is a strict YAML subset.
  validateDimensionRegistry(registry);
  return Object.freeze({ ...registry, dimensions: Object.freeze(registry.dimensions) });
}
const DIMENSION_REGISTRY = loadDimensionRegistry();
module.exports = { REGISTRY_PATH, DIMENSION_REGISTRY_CONTRACT, CANONICAL_DIMENSION_IDS, DIMENSION_REGISTRY, validateDimensionRegistry, loadDimensionRegistry };
