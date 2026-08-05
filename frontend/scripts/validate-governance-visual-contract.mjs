import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sharedUi = join(root, "src", "shared", "ui");
const governanceFeatures = join(root, "src", "features", "governance");
const forbiddenRoots = [join(root, "src", "design-system"), join(root, "src", "features", "design-system")];
const failures = [];
const fail = (message) => failures.push(message);

for (const forbiddenRoot of forbiddenRoots) if (existsSync(forbiddenRoot)) fail(`forbidden second UI-kit root exists: ${relative(root, forbiddenRoot)}`);

const walkFiles = (dir, matcher) => {
  const files = [];
  const walk = (current) => {
    if (!existsSync(current)) return;
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      const stat = statSync(path);
      if (stat.isDirectory()) walk(path);
      else if (matcher(entry)) files.push(path);
    }
  };
  walk(dir);
  return files;
};

const sharedFiles = walkFiles(sharedUi, (entry) => /\.(ts|tsx|css)$/.test(entry));
for (const file of sharedFiles) {
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file);
  if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|color-mix\(|linear-gradient\(/i.test(text)) fail(`raw color/gradient in shared UI: ${rel}`);
  if (/grid-cols-\[|shadow-\[|w-\[|h-\[|z-\[|rounded-\[/.test(text)) fail(`arbitrary governed utility in shared UI: ${rel}`);
  if (/fetch\(|useLogto|role ===|roles\.includes/.test(text)) fail(`shared UI/pattern contains endpoint or authorization logic: ${rel}`);
}

const index = readFileSync(join(sharedUi, "index.ts"), "utf8");
for (const symbol of ["EntityWorkspace", "SettingsWorkbench", "MasterDetail", "GroupedToggleList", "HierarchyWorkbench", "FilterToolbar", "FormDrawer", "ResponsiveDataView"]) {
  if (!index.includes(symbol)) fail(`pattern is not exported from shared/ui/index.ts: ${symbol}`);
}

const governanceFiles = walkFiles(governanceFeatures, (entry) => /\.(ts|tsx)$/.test(entry));
for (const file of governanceFiles) {
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file);
  if (/fixed inset-0|role="dialog"|aria-modal="true"/.test(text) && !rel.endsWith("RoleNameEditorDrawer.tsx")) fail(`governance feature must compose shared FormDrawer instead of a local fixed dialog: ${rel}`);
  if (/✏️|↺/.test(text)) fail(`emoji glyph action icon in governance feature: ${rel}`);
}

const primitivesCss = readFileSync(join(root, "src", "styles", "primitives.css"), "utf8");
for (const required of [".civitas-form-drawer-overlay", "justify-content: flex-end", "height: 100vh", "grid-template-rows: auto minmax(0, 1fr) auto", ".civitas-form-drawer-footer", "position: sticky", "width: 100vw"]) {
  if (!primitivesCss.includes(required)) fail(`FormDrawer right-side/full-height contract missing CSS: ${required}`);
}
const formDrawer = readFileSync(join(sharedUi, "patterns", "FormDrawer.tsx"), "utf8");
for (const required of ["document.body.style.overflow", "previousFocusRef.current?.focus()", "event.key === \"Escape\"", "aria-modal=\"true\"", "IconX", "initialFocusRef", "preventClose"]) {
  if (!formDrawer.includes(required)) fail(`FormDrawer behavior contract missing: ${required}`);
}

if (failures.length) {
  console.error("[governance-visual-contract] failed:");
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}
console.log("[governance-visual-contract] shared UI primitives and governance drawers use the canonical visual contract.");
