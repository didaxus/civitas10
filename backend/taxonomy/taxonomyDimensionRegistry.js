"use strict";
const fs = require("node:fs");
const path = require("node:path");
const REGISTRY_PATH = path.resolve(__dirname, "../../contracts/authorization/data-scope-dimensions.yaml");
function loadDimensionRegistry(file = REGISTRY_PATH) {
  const registry = JSON.parse(fs.readFileSync(file, "utf8")); // JSON is a strict YAML subset.
  if (registry.contract !== "civitas.authorization.data-scope-dimensions" || !registry.version || !registry.dimensions) throw new Error("taxonomy_dimension_registry_invalid");
  return Object.freeze({ ...registry, dimensions: Object.freeze(registry.dimensions) });
}
const DIMENSION_REGISTRY = loadDimensionRegistry();
module.exports = { REGISTRY_PATH, DIMENSION_REGISTRY, loadDimensionRegistry };
