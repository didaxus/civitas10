import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const require = createRequire(import.meta.url);
const contracts = require("../../core/organization-mapping/index.cjs");
const actions = Object.fromEntries(contracts.organizationMappingLifecycleActions.map((entry) => [entry.actionId, entry]));
await writeFile(new URL("../src/generated/organization-mapping-contracts.ts", import.meta.url), `// Generated from core/organization-mapping. Do not edit.\nexport const ORGANIZATION_MAPPING_ACTIONS = ${JSON.stringify(actions, null, 2)} as const;\nexport type OrganizationMappingActionId = keyof typeof ORGANIZATION_MAPPING_ACTIONS;\n`);
