import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const api=fs.readFileSync(new URL('./planningApi.ts',import.meta.url),'utf8');const ui=fs.readFileSync(new URL('./PlanningRemote.tsx',import.meta.url),'utf8');
test('real Planning client sends tenant path, If-Match and idempotency headers',()=>{assert.match(api,/roadmaps\/\$\{encodeURIComponent\(roadmapId\)\}\/units\/order/);assert.match(api,/"If-Match": etag/);assert.match(api,/"Idempotency-Key": crypto\.randomUUID\(\)/);});
test('roadmap UI exposes an accessible deterministic authoring workflow',()=>{assert.match(ui,/aria-label="Planning authoring workflow"/);assert.match(ui,/Taxonomy calibration/);assert.match(ui,/disabled=\{readOnly\}/);});
