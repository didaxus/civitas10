"use strict";

const CANONICAL_DIMENSION_IDS = Object.freeze([
  "academic.school_year",
  "academic.term",
  "academic.term_type",
  "academic.stage",
  "academic.grade_level",
  "academic.year_level",
  "academic.faculty",
  "academic.department",
  "academic.program",
  "academic.program_level",
  "academic.credential_level",
  "academic.program_version",
  "academic.modality",
  "academic.cohort",
  "academic.subject",
  "academic.course",
  "academic.class",
  "organization.region",
  "organization.campus",
  "organization.shift",
  "organization.department",
  "organization.coordination",
  "administration.function",
  "geography.administrative_area",
  "geography.municipality",
]);

function isCanonicalDimensionId(dimensionId) {
  return CANONICAL_DIMENSION_IDS.includes(dimensionId);
}

module.exports = Object.freeze({
  CANONICAL_DIMENSION_IDS,
  isCanonicalDimensionId,
});
