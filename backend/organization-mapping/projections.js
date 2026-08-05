"use strict";
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.freeze(Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])));
  return value;
}
function buildOrganizationGraph(model = {}) {
  const nodes = [...(model.nodes || [])].map((node) => ({ id: String(node.id), kind: String(node.kind || "node"), label: String(node.label || node.id), facets: canonicalize(node.facets || {}) })).sort((a,b)=>a.id.localeCompare(b.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = [...(model.edges || [])].filter((edge) => nodeIds.has(String(edge.from)) && nodeIds.has(String(edge.to))).map((edge) => ({ from: String(edge.from), to: String(edge.to), relationship: String(edge.relationship || "contains"), facets: canonicalize(edge.facets || {}) })).sort((a,b)=>`${a.from}:${a.to}:${a.relationship}`.localeCompare(`${b.from}:${b.to}:${b.relationship}`));
  return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges) });
}
function buildPrimaryScopeTree(model = {}) {
  const graph = buildOrganizationGraph(model);
  const children = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of graph.edges.filter((edge) => edge.relationship === "contains")) children.get(edge.from)?.push(edge.to);
  const targets = new Set(graph.edges.filter((edge) => edge.relationship === "contains").map((edge) => edge.to));
  const roots = graph.nodes.filter((node) => !targets.has(node.id)).map((node) => node.id).sort();
  const visit = (id) => Object.freeze({ id, children: Object.freeze((children.get(id) || []).sort().map(visit)) });
  return Object.freeze({ roots: Object.freeze(roots.map(visit)) });
}
function buildReusableFacets(model = {}) { return Object.freeze([...(model.facets || [])].map(canonicalize).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))); }
function buildReconciliationWorkItems({ organizationId, publicationId, graph }) { return Object.freeze(graph.nodes.map((node) => Object.freeze({ organizationId, publicationId, targetType: "organization_model_node", targetId: node.id, status: "pending", grantsAccess: false })).sort((a,b)=>a.targetId.localeCompare(b.targetId))); }
module.exports = { canonicalize, buildOrganizationGraph, buildPrimaryScopeTree, buildReusableFacets, buildReconciliationWorkItems };
