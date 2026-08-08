import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source=fs.readFileSync(new URL("./authorization.tsx",import.meta.url),"utf8");

test("authorization identity remounts the state owner rather than only the context provider",()=>{
  assert.match(source,/<AuthorizationDecisionProvider key=\{boundaryKey\}/);
  assert.doesNotMatch(source,/<AuthorizationDecisionContext\.Provider key=/);
  for(const identity of ["surface", "organizationId", "identity.subjectId", "actionId", "identity.generation"]) assert.match(source,new RegExp(`boundaryKey[^;]+${identity.replace(".","\\.")}`));
});

test("A to B to A, subject, membership, role, and snapshot transitions cannot expose old query data",()=>{
  assert.match(source,/setIdentity\(value => \(\{ generation: value\.generation \+ 1 \}\)\)/, "membership/subject invalidation is unresolved immediately");
  assert.match(source,/controller\.abort\(\)/, "transition aborts the prior request");
  assert.match(source,/requestGeneration === generation\.current && exactContext/, "late authorization responses are rejected");
  for(const keyPart of ["decision?.organizationId", "decision?.subjectId", "decision?.policyVersion", "decision?.scopeVersion", "decision?.actionId", "decision?.authorizationSnapshotVersion"]) assert.match(source,new RegExp(keyPart.replaceAll("?","\\?").replaceAll(".","\\.")));
  assert.match(source,/state\.key === stableKey \? state : \(\{ loading: false \}/, "the first render of every key transition hides the previous payload");
  assert.match(source,/generation === requestGeneration\.current/, "A-B-A late payloads are rejected even when a key repeats");
  assert.match(source,/useLayoutEffect/, "old protected requests are cancelled before paint");
});
