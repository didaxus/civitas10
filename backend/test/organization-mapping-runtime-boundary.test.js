"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const sharedDimensions = require("../../core/authz/canonical-dimension-ids.cjs");
const taxonomyDimensions = require("../taxonomy/taxonomyDimensionRegistry");

test("organization mapping uses a core-owned canonical dimension contract", () => {
  assert.strictEqual(
    taxonomyDimensions.CANONICAL_DIMENSION_IDS,
    sharedDimensions.CANONICAL_DIMENSION_IDS,
  );
  assert.equal(sharedDimensions.CANONICAL_DIMENSION_IDS.length, 25);
  assert.equal(sharedDimensions.isCanonicalDimensionId("academic.term"), true);
  assert.equal(sharedDimensions.isCanonicalDimensionId("academic.period"), false);

  const engineSource = fs.readFileSync(
    path.resolve(__dirname, "../../core/organization-mapping/mapping-engine.cjs"),
    "utf8",
  );
  assert.doesNotMatch(engineSource, /backend[\\/]taxonomy/);
  assert.match(engineSource, /authz[\\/]canonical-dimension-ids\.cjs/);
});
