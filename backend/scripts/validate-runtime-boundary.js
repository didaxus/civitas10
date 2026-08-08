"use strict";

const { readFileSync, readdirSync, statSync } = require("node:fs");
const { dirname, relative, resolve, sep } = require("node:path");

const repoRoot = resolve(__dirname, "../..");
const backendRoot = resolve(repoRoot, "backend");
const coreRoot = resolve(repoRoot, "core");
const allowedRuntimeRoots = [coreRoot, resolve(repoRoot, "dist")];
const coreOnly = process.argv.includes("--core-only");

const isInside = (child, parent) => {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel));
};

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".git"].includes(entry)) continue;
    const path = resolve(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, files);
    else if (/\.(?:js|cjs|mjs)$/.test(entry)) files.push(path);
  }
  return files;
}

function runtimeTarget(fromFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [base, `${base}.js`, `${base}.cjs`, `${base}.mjs`, resolve(base, "index.js")];
  return candidates[0];
}

const importPattern = /(?:require\(\s*["']([^"']+)["']\s*\)|import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["'])/g;
const violations = [];
if (!coreOnly) {
  for (const file of walk(backendRoot)) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1] || match[2];
      const target = runtimeTarget(file, specifier);
      if (!target || isInside(target, backendRoot)) continue;
      if (allowedRuntimeRoots.some((root) => isInside(target, root))) continue;
      violations.push(`${relative(repoRoot, file)} imports ${specifier} outside the backend runtime boundary`);
    }
  }
}

for (const file of walk(coreRoot)) {
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] || match[2];
    const target = runtimeTarget(file, specifier);
    if (target && isInside(target, backendRoot)) {
      violations.push(`${relative(repoRoot, file)} must not import backend runtime code`);
    }
  }
}

if (!coreOnly) {
  const compose = readFileSync(resolve(repoRoot, "docker-compose.yml"), "utf8");
  for (const service of ["api", "worker"]) {
    const block = compose.match(new RegExp(`\\n  ${service}:([\\s\\S]*?)(?=\\n  [a-zA-Z0-9_-]+:|\\nnetworks:|$)`));
    if (!block || !/build:\s*\n\s*context:\s*\./.test(block[1]) || !/dockerfile:\s*backend\/Dockerfile/.test(block[1])) {
      violations.push(`${service} must build from repo root with backend/Dockerfile so /core and /dist are packageable`);
    }
  }

  const dockerfile = readFileSync(resolve(repoRoot, "backend/Dockerfile"), "utf8");
  for (const requiredCopy of ["COPY core/ /core/", "COPY dist/ /dist/"]) {
    if (!dockerfile.includes(requiredCopy)) violations.push(`backend/Dockerfile must include: ${requiredCopy}`);
  }
}

if (violations.length) {
  console.error(["Backend runtime boundary violations:", ...violations.map((v) => `- ${v}`)].join("\n"));
  process.exit(1);
}

console.log(coreOnly
  ? "Core runtime boundary is packageable: core does not import backend runtime code."
  : "Backend runtime boundary is packageable: backend image includes /app, /core, and /dist.");
