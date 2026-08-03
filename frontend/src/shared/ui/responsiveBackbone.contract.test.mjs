import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const tokensCss = readFileSync(new URL("../../styles/tokens.css", import.meta.url), "utf8");
const primitivesCss = readFileSync(new URL("../../styles/primitives.css", import.meta.url), "utf8");
const layoutCss = readFileSync(new URL("../../styles/layout.css", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../../styles/theme.css", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../hooks/useBreakpoint.ts", import.meta.url), "utf8");
const barrel = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const sectionCard = readFileSync(new URL("./SectionCard.tsx", import.meta.url), "utf8");
const dataTable = readFileSync(new URL("./DataTable.tsx", import.meta.url), "utf8");
const appShell = readFileSync(new URL("../../layouts/AppShell.tsx", import.meta.url), "utf8");
const navCollapse = readFileSync(new URL("./NavCollapse.tsx", import.meta.url), "utf8");
const workspaceShell = readFileSync(new URL("./WorkspaceShell.tsx", import.meta.url), "utf8");
const ownerRegistry = readFileSync(new URL("../../features/owner/organizations/organizations.screen.ts", import.meta.url), "utf8");
const stylesIndex = readFileSync(new URL("../../styles/index.css", import.meta.url), "utf8");
const actionButtons = readFileSync(new URL("../../components/layout/TopBar/ActionButtons.tsx", import.meta.url), "utf8");
const actionButtonCss = readFileSync(new URL("../../components/common/ActionButton/ActionButton.module.css", import.meta.url), "utf8");

const rootTokenValue = (name) => {
  const match = tokensCss.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `${name} token must exist`);
  return match[1].trim();
};

const selectorBlock = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, "s"));
  assert.ok(match, `${selector} block must exist`);
  return match[1];
};

const declarationValue = (block, property) => {
  const match = block.match(new RegExp(`${property}:\\s*([^;]+);`));
  assert.ok(match, `${property} declaration must exist`);
  return match[1].trim();
};

const resolveRootVar = (value) => {
  let resolved = value;
  for (let index = 0; index < 8 && resolved.includes("var("); index += 1) {
    resolved = resolved.replace(/var\((--[a-z0-9-]+)\)/gi, (_match, name) => rootTokenValue(name));
  }
  return resolved;
};

test("responsive breakpoints are canonical and centralized", () => {
  for (const value of ["480px", "768px", "1024px", "1280px"]) {
    assert.match(tokensCss, new RegExp(value));
  }
  for (const css of [primitivesCss, layoutCss]) {
    const mediaValues = [...css.matchAll(/@media \((?:min|max)-width: ([^)]+)\)/g)].map((match) => match[1]);
    assert.deepEqual(mediaValues.filter((value) => !["480px", "768px", "1024px", "1280px"].includes(value)), []);
  }
});

test("responsive hook is the only viewport JS contract", () => {
  assert.match(hookSource, /BREAKPOINTS = \{ sm: 480, md: 768, lg: 1024, xl: 1280 \}/);
  assert.match(hookSource, /window\.matchMedia\(query\)/);
  assert.doesNotMatch(`${appShell}\n${sectionCard}\n${dataTable}`, /innerWidth/);
});

test("base primitives inherit responsive utilities", () => {
  assert.match(primitivesCss, /\.civitas-scroll-x\s*{[^}]*overflow-x: auto/s);
  assert.match(primitivesCss, /\.civitas-nowrap-children > \*\s*{\s*flex: 0 0 auto;/s);
  assert.match(primitivesCss, /\.civitas-visually-hidden\s*{[^}]*position: absolute;[^}]*width: 1px;[^}]*height: 1px;[^}]*overflow: hidden;[^}]*clip: rect\(0, 0, 0, 0\);/s);
  assert.match(primitivesCss, /\.civitas-stack-md\s*{\s*grid-template-columns: 1fr !important;/s);
  assert.match(primitivesCss, /\.civitas-kpi-grid\s*{[^}]*repeat\(auto-fit, minmax\(min\(100%, 10rem\), 1fr\)\)/s);
  assert.match(sectionCard, /civitas-pad-tight-md/);
  assert.match(dataTable, /civitas-table-wrap civitas-scroll-x/);
});

test("mobile navigation controls use English accessible labels", () => {
  assert.match(appShell, /aria-label="Open navigation"/);
  assert.match(appShell, /aria-label="Close navigation"/);
  assert.doesNotMatch(appShell, /Abrir menú/);
});

test("navigation is provided by the shared NavCollapse primitive", () => {
  assert.match(barrel, /NavCollapse/);
  assert.match(appShell, /<NavCollapse/);
  assert.match(workspaceShell, /<NavCollapse items=\{navigationItems\} label=\{label\}/);
  assert.doesNotMatch(workspaceShell, /<Link key=\{item\.id\}/);
  assert.match(tokensCss, /--civitas-nav-item-padding-x: var\(--civitas-space-3\);/);
  assert.match(layoutCss, /\.civitas-nav-link\s*{[^}]*padding: var\(--civitas-space-2\) var\(--civitas-nav-item-padding-x\);/s);
  assert.doesNotMatch(appShell, /<nav className="civitas-primary-nav"/);
});

test("owner sidebar navigation is an expanded desktop tree with mobile drawer only", () => {
  assert.match(navCollapse, /children\?: NavCollapseItem\[\]/);
  assert.match(navCollapse, /NAV_TREE_STORAGE_KEY = "civitas:nav-tree-expanded"/);
  assert.match(navCollapse, /setExpandedKeys\(\(current\) => current\.includes\(key\) \? current\.filter/);
  assert.match(navCollapse, /hidden=\{!expanded\}/);
  assert.match(navCollapse, /activeParentKeys\.slice\(0, 1\)/);
  assert.match(navCollapse, /itemCanBeSelfActive = \(item: NavCollapseItem, pathname: string\) => Boolean\(item\.path\) && itemIsActive\(item, pathname\)/);
  assert.match(navCollapse, /data-branch-active=\{branchActive\}/);
  assert.match(navCollapse, /selfActive \? "civitas-nav-link-active"/);
  assert.doesNotMatch(navCollapse, /collapsed/);
  assert.doesNotMatch(appShell, /SIDEBAR_STATE_STORAGE_KEY|sidebarCollapsed|civitas-sidebar-toggle|civitas-shell-sidebar-collapsed/);
  assert.match(appShell, /data-civitas-sidebar-state=\{sidebarState\}/);
  assert.match(appShell, /data-civitas-sidebar-mobile-state=\{mobileState\}/);
  assert.doesNotMatch(layoutCss, /civitas-shell-sidebar-collapsed|civitas-sidebar-toggle/);
});

test("shell topbar uses the canonical flex-between layout tokens", () => {
  assert.equal(rootTokenValue("--civitas-topbar-height"), "var(--topbar-height)");
  assert.equal(rootTokenValue("--topbar-height"), "4.5rem");
  assert.equal(rootTokenValue("--topbar-height-desktop"), "var(--topbar-height)");
  assert.equal(rootTokenValue("--topbar-height-tablet"), "var(--topbar-height)");
  assert.equal(rootTokenValue("--topbar-height-mobile"), "var(--topbar-height)");
  assert.equal(rootTokenValue("--topbar-padding-inline-desktop"), "var(--civitas-space-8)");
  assert.equal(rootTokenValue("--topbar-padding-inline-tablet"), "var(--civitas-space-6)");
  assert.equal(rootTokenValue("--topbar-padding-inline-mobile"), "var(--civitas-space-4)");
  assert.equal(rootTokenValue("--topbar-gap"), "var(--civitas-space-4)");
  assert.equal(rootTokenValue("--topbar-gap-tablet"), "var(--civitas-space-3)");
  assert.equal(rootTokenValue("--topbar-gap-mobile"), "var(--civitas-space-2)");
  assert.equal(rootTokenValue("--civitas-content-max-width"), "var(--topbar-max-width)");

  const shellTopbarBlock = selectorBlock(layoutCss, ".civitas-topbar");
  const topbarBlock = selectorBlock(layoutCss, ".civitas-topbar-inner");
  const leftBlock = selectorBlock(layoutCss, ".civitas-topbar-left,\n.civitas-topbar-center,\n.civitas-topbar-right");
  const centerBlock = selectorBlock(layoutCss, ".civitas-topbar-center");
  assert.equal(declarationValue(shellTopbarBlock, "height"), "var(--civitas-topbar-height)");
  assert.equal(declarationValue(shellTopbarBlock, "min-height"), "var(--civitas-topbar-height)");
  assert.equal(declarationValue(shellTopbarBlock, "max-height"), "var(--civitas-topbar-height)");
  assert.equal(declarationValue(shellTopbarBlock, "flex"), "0 0 var(--civitas-topbar-height)");
  assert.equal(declarationValue(topbarBlock, "justify-content"), "space-between");
  assert.equal(declarationValue(topbarBlock, "padding"), "var(--topbar-padding-desktop)");
  assert.doesNotMatch(layoutCss, /@media \(max-width: (?:1024|768)px\) \{[\s\S]*?\.civitas-topbar\s*\{[\s\S]*?height:/s);
  assert.equal(declarationValue(leftBlock, "gap"), "var(--topbar-gap)");
  assert.equal(declarationValue(centerBlock, "flex"), "1 1 auto");
  assert.equal(declarationValue(centerBlock, "justify-content"), "center");
  assert.match(layoutCss, /\.civitas-topbar-right\s*\{[^}]*margin-left:\s*auto;/s);
});

test("authenticated shell has explicit desktop and mobile scroll containers", () => {
  assert.match(stylesIndex, /html,\s*body,\s*#root\s*{[^}]*height: 100%;[^}]*overflow: hidden;/s);
  assert.match(layoutCss, /\.civitas-shell\s*{[^}]*height: 100vh;[^}]*height: var\(--civitas-viewport-height\);[^}]*overflow: hidden;/s);
  assert.match(layoutCss, /\.civitas-sidebar\s*{[^}]*height: 100vh;[^}]*height: var\(--civitas-viewport-height\);[^}]*overflow: hidden;/s);
  assert.match(layoutCss, /\.civitas-sidebar \.civitas-nav-row,\s*\.civitas-workspace-shell \.civitas-nav-row\s*{[^}]*min-height: 0;[^}]*overflow-y: auto;/s);
  assert.match(layoutCss, /@media \(max-width: 768px\) \{[\s\S]*?\.civitas-sidebar\s*\{[\s\S]*?height: var\(--civitas-nav-mobile-max-height\);[\s\S]*?overflow: hidden;/s);
  assert.match(layoutCss, /\.civitas-shell-content\s*{[^}]*overflow: hidden;/s);
  assert.match(layoutCss, /\.civitas-main\s*{[^}]*overflow-y: auto;[^}]*scrollbar-width: thin;/s);
  assert.match(layoutCss, /@media \(max-width: 768px\) \{[\s\S]*?\.civitas-shell\s*\{[\s\S]*?height: var\(--civitas-viewport-height\);[\s\S]*?overflow: hidden;/s);
  assert.match(layoutCss, /@media \(max-width: 768px\) \{[\s\S]*?\.civitas-shell-content\s*\{[\s\S]*?height: var\(--civitas-viewport-height\);[\s\S]*?overflow: hidden;/s);
  assert.match(layoutCss, /@media \(max-width: 768px\) \{[\s\S]*?\.civitas-main\s*\{[\s\S]*?overflow-y: auto;[\s\S]*?-webkit-overflow-scrolling: touch;/s);
  assert.match(layoutCss, /\.civitas-main > \*\s*{[^}]*max-width: min\(100%, var\(--civitas-content-max-width\)\);/s);
});

test("sidebar nav geometry computes from one canonical token family", () => {
  const readDeclarations = (selector) => {
    const blocks = [...layoutCss.matchAll(/([^{}]+)\{([^}]*)\}/g)];
    const match = blocks.find(([, selectorList]) => selectorList.split(",").map((entry) => entry.trim()).includes(selector));
    assert.ok(match, `Missing CSS selector: ${selector}`);
    return Object.fromEntries(match[2].split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
      const [property, ...value] = entry.split(":");
      return [property.trim(), value.join(":").trim()];
    }));
  };
  const rootTokens = Object.fromEntries([...tokensCss.matchAll(/(--civitas-[\w-]+):\s*([^;]+);/g)].map((match) => [match[1], match[2].trim()]));
  const resolveTokens = (value, localTokens = {}) => value.replace(/var\((--civitas-[\w-]+)\)/g, (_, token) => resolveTokens(localTokens[token] || rootTokens[token] || "", localTokens));
  const toRemNumber = (value, localTokens = {}) => {
    const resolved = resolveTokens(value, localTokens).replace(/calc\((.*)\)/, "$1").trim();
    const normalized = resolved.replace(/([0-9.]+)rem/g, "$1").replace(/\s*\*\s*/g, "*");
    return normalized.split("+").map((part) => {
      const term = part.trim();
      if (term.includes("*")) {
        return term.split("*").map(Number).reduce((product, number) => product * number, 1);
      }
      return Number(term);
    }).reduce((sum, number) => sum + number, 0);
  };

  const tokenNames = [
    "--civitas-nav-item-padding-x",
    "--civitas-nav-child-indent",
    "--civitas-nav-item-height",
    "--civitas-nav-item-gap",
    "--civitas-nav-icon-size",
    "--civitas-nav-icon-label-gap",
  ];
  for (const tokenName of tokenNames) {
    assert.equal([...tokensCss.matchAll(new RegExp(`${tokenName}:`, "g"))].length, 1, `${tokenName} must have exactly one canonical definition`);
  }

  const header = readDeclarations(".civitas-sidebar-header");
  const genericNav = readDeclarations(".civitas-primary-nav");
  const topbarNav = readDeclarations(".civitas-topbar .civitas-primary-nav");
  const sidebarNav = readDeclarations(".civitas-sidebar .civitas-primary-nav");
  const parent = { ...readDeclarations(".civitas-sidebar .civitas-nav-link"), "--civitas-nav-depth-offset": "0rem" };
  const child = { ...parent, ...readDeclarations('.civitas-sidebar .civitas-nav-link[data-depth="1"]') };
  const icon = readDeclarations(".civitas-nav-link-icon");

  const headerPadding = toRemNumber(header["padding-left"]);
  const parentPadding = toRemNumber(parent["padding-left"], parent);
  const childPadding = toRemNumber(child["padding-left"], child);
  const basePadding = toRemNumber("var(--civitas-nav-item-padding-x)");
  const childIndent = toRemNumber("var(--civitas-nav-child-indent)");

  assert.equal(genericNav["align-items"], undefined, "generic nav must not carry legacy centered alignment into the sidebar");
  assert.equal(topbarNav["align-items"], "center", "topbar nav owns its horizontal centering explicitly");
  assert.equal(sidebarNav["align-items"], "stretch", "sidebar nav must own left-aligned row stretching");
  assert.equal(parent.width, "100%", "sidebar nav rows must fill the nav column before padding is computed");
  assert.equal(headerPadding, basePadding);
  assert.equal(parentPadding, basePadding);
  assert.ok(childIndent > 0, "child nav items must be visually dependent on their parent with one tokenized indent");
  assert.equal(childPadding, basePadding + childIndent);
  assert.equal(childPadding > parentPadding, true);
  assert.equal(toRemNumber(parent.height, parent), toRemNumber("var(--civitas-nav-item-height)"));
  assert.equal(toRemNumber(child["min-height"], child), toRemNumber("var(--civitas-nav-item-height)"));
  assert.equal(toRemNumber(icon.width), toRemNumber("var(--civitas-nav-icon-size)"));
  assert.equal(toRemNumber(icon.height), toRemNumber("var(--civitas-nav-icon-size)"));
  assert.doesNotMatch(layoutCss, /civitas-shell-sidebar-collapsed|civitas-sidebar-toggle/);
});

test("desktop collapsed rail and flyout tokens are absent during Phase 2", () => {
  assert.doesNotMatch(tokensCss, /sidebar-collapsed|nav-flyout|z-nav-flyout/);
  assert.doesNotMatch(themeCss, /nav-flyout/);
  assert.doesNotMatch(layoutCss, /civitas-shell-sidebar-collapsed|nav-flyout|civitas-sidebar-toggle/);
});
