"use strict";
const { MANAGEMENT_LEVEL_CATALOG_VERSION, MANAGEMENT_LEVELS, managementLevelOrder } = require("./managementLevelCatalog");
function managementLevelCatalogDto() { return { catalogVersion: MANAGEMENT_LEVEL_CATALOG_VERSION, root: { managementLevel: "organization", levelOrder: 0, virtual: true, persisted: false }, levels: MANAGEMENT_LEVELS.map((managementLevel) => ({ managementLevel, levelOrder: managementLevelOrder(managementLevel), virtual: managementLevel === "organization", persisted: managementLevel !== "organization" })) }; }
module.exports = { managementLevelCatalogDto };
