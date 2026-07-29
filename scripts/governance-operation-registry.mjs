import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const { GOVERNANCE_OPERATION_REGISTRY_VERSION, governanceOperationRegistry, moduleInventory } = require(resolve(root, "core/governance/operation-registry.cjs"));
const target = resolve(root, "frontend/src/features/governance/operation-registry.generated.json");
const artifact = { _generated: { notice: "GENERATED — DO NOT EDIT", source: "core/governance/operation-registry.cjs", command: "npm run governance:registry:generate" }, registryVersion: GOVERNANCE_OPERATION_REGISTRY_VERSION, operations: governanceOperationRegistry, modules: moduleInventory };
const output = `${JSON.stringify(artifact, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const current = JSON.parse(readFileSync(target, "utf8"));
  if (!isDeepStrictEqual(current, artifact)) { console.error("Governance operation registry artifact is stale. Run npm run governance:registry:generate."); process.exit(1); }
  console.log("Governance operation registry artifact is current.");
} else { writeFileSync(target, output); console.log(`Generated ${target}`); }
