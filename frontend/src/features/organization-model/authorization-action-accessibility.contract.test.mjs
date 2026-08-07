import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = relative => fs.readFileSync(new URL(relative, import.meta.url), "utf8");
const primitive = read("../../shared/ui/components/DisabledActionHint.tsx");
const authorization = read("./authorization.tsx");
const migratedPages = [
  "./DataScopesPage.tsx",
  "./DataScopesWorkspace.tsx",
  "./StructurePage.tsx",
  "./StructureWorkspace.tsx",
].map(read);

test("explained disabled actions remain keyboard focusable and prevent invocation", () => {
  assert.match(primitive, /aria-disabled=\{ariaDisabled \|\| undefined\}/, "the default unavailable state uses aria-disabled instead of removing the button from tab order");
  assert.match(primitive, /event\.key === "Enter" \|\| event\.key === " "/, "keyboard activation is explicitly suppressed");
  assert.match(primitive, /event\.preventDefault\(\)/, "disabled pointer, submit, and keyboard defaults are prevented");
  assert.match(primitive, /disabled=\{disabled && !focusableWhenDisabled\}/, "native disabled semantics remain available when focus discovery is not required");
});

test("the persistent explanation is visibly rendered and programmatically related", () => {
  assert.match(primitive, /explained \? hintId : undefined/, "the control adds the explanation id to its accessible description");
  assert.match(primitive, /aria-describedby=\{describedBy\}/, "the control references its explanation");
  assert.match(primitive, /<DisabledActionHint id=\{hintId\}>\{disabledReason\}<\/DisabledActionHint>/, "the referenced explanation remains in the document and visible");
  assert.doesNotMatch(primitive, /title=/, "the primitive does not rely on a hover-only title");
});

test("authorization actions disclose only the backend reason category and safe remediation", () => {
  assert.match(authorization, /terminalReasonCode \|\| state\.status/);
  assert.match(authorization, /remediation\?\.safeMessage/);
  assert.match(authorization, /<DisabledActionButton \{\.\.\.props\} disabled=\{disabled\} disabledReason=\{explanation\}/);
  assert.doesNotMatch(authorization, /state\.decision\?\.evaluatedStages/, "restricted evaluated-stage evidence is not included in action explanations");
});

test("organization-model authorization buttons use the shared action primitive without title-only reasons", () => {
  for (const page of migratedPages) {
    assert.doesNotMatch(page, /<AuthorizationAction>\{\(/, "legacy render-prop buttons were migrated");
    assert.doesNotMatch(page, /title=\{(?:reason|why)\}/, "authorization explanations are not title-only");
  }
});
