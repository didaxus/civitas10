"use strict";
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../..");
const legacy = /academic\.(?:section|grade_level)/g;
const ignored = new Set(["node_modules", ".git", "dist"]);
function allowed(relative, source) {
  if (/^backend\/db\/migrations\//.test(relative) || /taxonomyV2MigrationService\.js$/.test(relative)) return true;
  if (/\b(?:fixtures?|test)\/.*(?:reject|migration|legacy)/i.test(relative)) return true;
  if (/^artifacts\//.test(relative)) return true;
  if (/^docs\//.test(relative)) return source.includes("Historical legacy strings: explicitly marked");
  return false;
}
const violations = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else { const relative = path.relative(root, file).replaceAll(path.sep, "/"); let source; try { source = fs.readFileSync(file, "utf8"); } catch { continue; } if (legacy.test(source) && !allowed(relative, source)) violations.push(relative); legacy.lastIndex = 0; }
  }
}
walk(root);
if (violations.length) { console.error(`legacy taxonomy dimensions outside explicit allow-list:\n${violations.join("\n")}`); process.exit(1); }
console.log("taxonomy v2 legacy gate passed");
