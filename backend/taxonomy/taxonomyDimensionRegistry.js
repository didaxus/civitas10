"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REGISTRY_PATH = path.resolve(__dirname, "../../contracts/authorization/data-scope-dimensions.yaml");
const LEGACY_CONTRACT_ID = "civitas.authorization.data-scope-dimensions";
const CANONICAL_SCHEMA_VERSION = "civitas-data-scope-dimensions-schema/v1";
const CANONICAL_CONTRACT_VERSION_PATTERN = /^civitas-data-scope-dimensions\/v\d+$/;

function isCanonicalRegistry(registry) {
  return registry
    && registry.schemaVersion === CANONICAL_SCHEMA_VERSION
    && CANONICAL_CONTRACT_VERSION_PATTERN.test(registry.contractVersion || "")
    && Array.isArray(registry.dimensions)
    && registry.dimensions.length > 0;
}

function isLegacyRegistry(registry) {
  return registry
    && registry.contract === LEGACY_CONTRACT_ID
    && Boolean(registry.version)
    && Array.isArray(registry.dimensions)
    && registry.dimensions.length > 0;
}

function loadDimensionRegistry(file = REGISTRY_PATH) {
  const registry = JSON.parse(fs.readFileSync(file, "utf8")); // JSON is a strict YAML subset.

  if (!isCanonicalRegistry(registry) && !isLegacyRegistry(registry)) {
    throw new Error("taxonomy_dimension_registry_invalid");
  }

  const contractVersion = registry.contractVersion || registry.version;
  const normalizedRegistry = {
    ...registry,
    // Compatibility aliases for runtime consumers created before the v2 contract.
    contract: registry.contract || LEGACY_CONTRACT_ID,
    version: registry.version || contractVersion,
    contractVersion,
    dimensions: Object.freeze(registry.dimensions.map((dimension) => Object.freeze({ ...dimension }))),
  };

  return Object.freeze(normalizedRegistry);
}

const DIMENSION_REGISTRY = loadDimensionRegistry();

module.exports = {
  REGISTRY_PATH,
  DIMENSION_REGISTRY,
  loadDimensionRegistry,
};
