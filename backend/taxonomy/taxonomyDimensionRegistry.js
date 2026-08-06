"use strict";
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const Ajv2020 = require("ajv/dist/2020");
const { CANONICAL_DIMENSION_IDS } = require("../../core/authz/canonical-dimension-ids.cjs");

const REGISTRY_PATH = path.resolve(__dirname, "../../contracts/authorization/data-scope-dimensions.yaml");
const REGISTRY_SCHEMA_PATH = path.resolve(__dirname, "../../contracts/authorization/schemas/data-scope-dimensions.schema.json");
const DIMENSION_REGISTRY_CONTRACT = "civitas.authorization.data-scope-dimensions";
const DIMENSION_REGISTRY_SCHEMA_VERSION = "civitas-data-scope-dimensions-schema/v1";
const DIMENSION_REGISTRY_CONTRACT_VERSION = "civitas-data-scope-dimensions/v3";
const REGISTRY_ERROR_CODES = Object.freeze({
  FILE_MISSING: "taxonomy_dimension_registry_file_missing",
  MALFORMED: "taxonomy_dimension_registry_malformed",
  SCHEMA_INVALID: "taxonomy_dimension_registry_schema_invalid",
  CONTRACT_VERSION_INCOMPATIBLE: "taxonomy_dimension_registry_contract_version_incompatible",
  DIMENSIONS_MISSING: "taxonomy_dimension_registry_dimensions_missing",
  DIMENSION_IDS_DUPLICATED: "taxonomy_dimension_registry_dimension_ids_duplicated",
});

class TaxonomyDimensionRegistryError extends Error {
  constructor(code, options = {}) {
    super(code, options);
    this.name = "TaxonomyDimensionRegistryError";
    this.code = code;
  }
}

const registrySchema = JSON.parse(fs.readFileSync(REGISTRY_SCHEMA_PATH, "utf8"));
const validateSchema = new Ajv2020({ allErrors: true, strict: true }).compile(registrySchema);
const fail = (code, cause) => { throw new TaxonomyDimensionRegistryError(code, cause ? { cause } : undefined); };

function validateDimensionRegistry(registry) {
  if (registry?.contractVersion !== DIMENSION_REGISTRY_CONTRACT_VERSION) fail(REGISTRY_ERROR_CODES.CONTRACT_VERSION_INCOMPATIBLE);
  if (!Array.isArray(registry?.dimensions) || registry.dimensions.length === 0) fail(REGISTRY_ERROR_CODES.DIMENSIONS_MISSING);

  const ids = registry.dimensions.map((dimension) => dimension?.id);
  if (ids.some((id, index) => typeof id === "string" && ids.indexOf(id) !== index)) fail(REGISTRY_ERROR_CODES.DIMENSION_IDS_DUPLICATED);
  if (registry.schemaVersion !== DIMENSION_REGISTRY_SCHEMA_VERSION || !validateSchema(registry)) fail(REGISTRY_ERROR_CODES.SCHEMA_INVALID);
  if (ids.length !== CANONICAL_DIMENSION_IDS.length || ids.some((id, index) => id !== CANONICAL_DIMENSION_IDS[index])) fail(REGISTRY_ERROR_CODES.SCHEMA_INVALID);
  return registry;
}

function loadDimensionRegistry(file = REGISTRY_PATH) {
  let source;
  try {
    source = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") fail(REGISTRY_ERROR_CODES.FILE_MISSING, error);
    throw error;
  }

  let registry;
  try {
    registry = YAML.parse(source, { prettyErrors: false, strict: true });
  } catch (error) {
    fail(REGISTRY_ERROR_CODES.MALFORMED, error);
  }
  validateDimensionRegistry(registry);
  return Object.freeze({ ...registry, dimensions: Object.freeze(registry.dimensions), deprecatedDimensions: Object.freeze(registry.deprecatedDimensions || []) });
}

const DIMENSION_REGISTRY = loadDimensionRegistry();
module.exports = {
  REGISTRY_PATH, REGISTRY_SCHEMA_PATH, DIMENSION_REGISTRY_CONTRACT, DIMENSION_REGISTRY_SCHEMA_VERSION,
  DIMENSION_REGISTRY_CONTRACT_VERSION, CANONICAL_DIMENSION_IDS, REGISTRY_ERROR_CODES,
  TaxonomyDimensionRegistryError, DIMENSION_REGISTRY, validateDimensionRegistry, loadDimensionRegistry,
};
