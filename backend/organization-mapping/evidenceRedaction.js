"use strict";
const BLOCKED = /token|secret|password|assertion|authorization/i;
const SENSITIVE = /email|name|phone|address|subject|claims/i;
function redactEvidence(value) {
  if (Array.isArray(value)) return value.map(redactEvidence);
  if (!value || typeof value !== "object") return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (BLOCKED.test(key)) return [key, "[blocked]"];
    if (SENSITIVE.test(key)) return [key, "[redacted]"];
    return [key, redactEvidence(item)];
  })));
}
module.exports = { redactEvidence };
