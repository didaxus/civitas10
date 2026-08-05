import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../..", import.meta.url).pathname);
const nginxPath = resolve(root, "frontend/nginx.conf");
const nginxSource = readFileSync(nginxPath, "utf8");
const dockerfileSource = readFileSync(resolve(root, "frontend/Dockerfile"), "utf8");
const appSource = readFileSync(resolve(root, "frontend/src/pages/App/index.tsx"), "utf8");
const callbackSource = readFileSync(resolve(root, "frontend/src/pages/Callback.tsx"), "utf8");
const configSource = readFileSync(resolve(root, "config/civitas.config.ts"), "utf8");

test("frontend image installs the production SPA Nginx configuration", () => {
  assert.equal(existsSync(nginxPath), true);
  assert.match(dockerfileSource, /FROM nginx:alpine AS runtime/);
  assert.match(dockerfileSource, /COPY frontend\/nginx\.conf \/etc\/nginx\/conf\.d\/default\.conf/);
});

test("Nginx serves SPA routes while keeping asset misses as real 404s", () => {
  assert.match(nginxSource, /root \/usr\/share\/nginx\/html;/);
  assert.match(nginxSource, /location \/assets\/\s*\{[\s\S]*try_files \$uri =404;[\s\S]*Cache-Control "public, immutable";/);
  assert.match(nginxSource, /location \/\s*\{[\s\S]*try_files \$uri \$uri\/ \/index\.html;/);
  assert.match(nginxSource, /location \/api\/\s*\{[\s\S]*return 404;/);
});

test("React callback route and redirect URI contract remain intact", () => {
  assert.match(appSource, /<Route path="\/callback" element=\{<Callback \/>\} \/>/);
  assert.match(callbackSource, /useHandleSignInCallback/);
  assert.match(configSource, /return `\$\{window\.location\.origin\}\/callback`/);
});
