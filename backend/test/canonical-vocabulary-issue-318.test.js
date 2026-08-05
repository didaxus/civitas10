"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { CANONICAL_DIMENSION_IDS, DIMENSION_REGISTRY } = require("../taxonomy/taxonomyDimensionRegistry");

test("canonical dimension vocabulary is unique and contains issue 318 distinctions", () => {
  assert.equal(new Set(CANONICAL_DIMENSION_IDS).size, CANONICAL_DIMENSION_IDS.length);
  for (const id of ["academic.grade_level","academic.school_year","academic.term","academic.term_type","academic.year_level","academic.faculty","academic.department","academic.program","academic.program_level","academic.credential_level","academic.program_version","organization.region","geography.administrative_area","geography.municipality"]) assert.ok(CANONICAL_DIMENSION_IDS.includes(id), id);
  assert.equal(CANONICAL_DIMENSION_IDS.includes("academic.period"), false);
  const byId = Object.fromEntries(DIMENSION_REGISTRY.dimensions.map((d) => [d.id, d.semanticDefinition]));
  assert.match(byId["academic.grade_level"], /not an assessment score/);
  assert.match(byId["academic.year_level"], /not K-12 grade level/);
  assert.match(byId["academic.term"], /not a term type/);
  assert.match(byId["organization.region"], /not government geography/);
});

test("no organizationType or organization presets were added", () => {
  for (const file of ["contracts/authorization/data-scope-dimensions.yaml","core/organization-mapping/lifecycle-action-registry.cjs"]) {
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), /organizationType|school_k12|university|technical institute/i);
  }
});
