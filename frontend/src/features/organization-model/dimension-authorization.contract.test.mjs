import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./DataScopesWorkspace.tsx", import.meta.url), "utf8");

test("readable dimensions do not inherit readDraft authorization for editing", () => {
  const readDraftDecision = { actionId: "organizationModel.readDraft", finalDecision: "allow", treatment: "filter" };
  const editDraftDecision = { actionId: "organizationModel.editDraft", finalDecision: "deny", treatment: "disable" };

  assert.equal(readDraftDecision.finalDecision, "allow");
  assert.equal(editDraftDecision.finalDecision, "deny");
  assert.equal(editDraftDecision.treatment, "disable");

  const dimensions = source.slice(source.indexOf("function Dimensions("), source.indexOf("function History("));
  assert.match(dimensions, /workspace\.dimensions\.map/,
    "dimension data remains rendered by the read-authorized workspace");
  assert.match(dimensions, /DimensionEditAction/,
    "editing uses the backend treatment-aware action instead of hiding dimension data");
  assert.doesNotMatch(dimensions, /saveDimensionConfiguration|useAuthorizedMutation/,
    "the readable list cannot create a save request or mutation payload");
});

test("dimension mutation is mounted only inside the editDraft boundary", () => {
  const editorStart = source.indexOf("function DimensionEditor(");
  const listStart = source.indexOf("function Dimensions(");
  const editor = source.slice(editorStart, listStart);
  const protectedEditor = /actionId="organizationModel\.editDraft"><AuthorizationBoundary><DimensionEditor/.exec(source);

  assert.ok(editorStart >= 0 && listStart > editorStart);
  assert.match(editor, /useAuthorizedMutation/);
  assert.match(editor, /saveDimensionConfiguration\.mutate/);
  assert.match(editor, /<AuthorizationAction\b/,
    "the save control follows the edit decision treatment");
  assert.ok(protectedEditor,
    "a denied edit decision is resolved before the editor and its mutation hook can render");
});
