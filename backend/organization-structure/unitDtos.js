"use strict";
const { isPersistedManagementLevel } = require("./managementLevelCatalog");
const { ORGANIZATION_STRUCTURE_REASON_CODES, structureError } = require("./organizationStructureReasonCodes");
const CREATE_FIELDS = new Set(["hierarchyKey", "unitType", "stableKey", "displayName", "description", "parentUnitId", "dimensionValueId", "managementLevel", "metadata"]);
const UPDATE_FIELDS = new Set(["displayName", "description", "managementLevel", "sortOrder", "metadata"]);
function parse(value, allowed, { requireLevel = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw structureError("organization_unit_dto_invalid");
  if (Object.hasOwn(value, "levelOrder")) throw structureError("organization_unit_level_order_read_only");
  if (value.managementLevel === "organization") throw structureError(ORGANIZATION_STRUCTURE_REASON_CODES.MANAGEMENT_LEVEL_ROOT_RESERVED);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw structureError("organization_unit_dto_unknown_field", undefined, { fields: unknown });
  if ((requireLevel || value.managementLevel != null) && !isPersistedManagementLevel(value.managementLevel)) throw structureError(ORGANIZATION_STRUCTURE_REASON_CODES.MANAGEMENT_LEVEL_UNKNOWN);
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
const parseCreateUnitDto = (value) => parse(value, CREATE_FIELDS, { requireLevel: true });
const parseUpdateUnitDto = (value) => parse(value, UPDATE_FIELDS);
function parseMoveUnitDto(value) { const dto = parse(value, new Set(["parentUnitId", "managementLevel"])); if (!Object.hasOwn(dto, "parentUnitId")) throw structureError("organization_unit_parent_required"); return dto; }
module.exports = { parseCreateUnitDto, parseMoveUnitDto, parseUpdateUnitDto };
