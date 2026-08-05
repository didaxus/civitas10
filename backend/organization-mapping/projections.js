"use strict";
const crypto=require("node:crypto");
const { relationshipRegistry }=require("../../core/organization-mapping/registries.cjs");
function canonicalize(value) { if(Array.isArray(value)) return value.map(canonicalize); if(value&&typeof value==="object") return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalize(value[key])])); return value; }
function fail(code,details={}) { const error=new Error(code); error.code=code; error.status=422; error.details=details; throw error; }
function projectionHash(value){return crypto.createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");}
function buildOrganizationGraph(model={}) {
  const nodes=[...(model.nodes||[])].map((node)=>({id:String(node.id),organizationId:node.organizationId||model.organizationId||null,kind:String(node.kind||"node"),status:node.status||"active",label:String(node.label||node.id),facets:canonicalize(node.facets||{}),provenance:canonicalize(node.provenance||{}) })).sort((a,b)=>a.id.localeCompare(b.id));
  if(new Set(nodes.map((node)=>node.id)).size!==nodes.length) fail("mapping_structure_duplicate_node");
  const byId=new Map(nodes.map((node)=>[node.id,node]));
  const edges=[...(model.edges||[])].map((edge)=>({from:String(edge.from),to:String(edge.to),relationship:String(edge.relationship),organizationId:edge.organizationId||model.organizationId||null,facets:canonicalize(edge.facets||{}),provenance:canonicalize(edge.provenance||{}) })).sort((a,b)=>`${a.from}:${a.to}:${a.relationship}`.localeCompare(`${b.from}:${b.to}:${b.relationship}`));
  for(const edge of edges){if(!relationshipRegistry.get(edge.relationship))fail("mapping_structure_relationship_unknown",{relationship:edge.relationship});if(!byId.has(edge.from)||!byId.has(edge.to))fail("mapping_structure_orphan_edge",{from:edge.from,to:edge.to});if(edge.from===edge.to)fail("mapping_structure_cycle",{nodeId:edge.from});const organizations=[model.organizationId,edge.organizationId,byId.get(edge.from).organizationId,byId.get(edge.to).organizationId].filter(Boolean);if(organizations.some((id)=>id!==organizations[0]))fail("mapping_structure_cross_tenant_reference");}
  return Object.freeze({modelVersion:model.modelVersion||null,nodes:Object.freeze(nodes),edges:Object.freeze(edges),hash:projectionHash({nodes,edges})});
}
function buildPrimaryScopeTree(model={}) {
  const graph=buildOrganizationGraph(model); const hierarchy=graph.edges.filter((edge)=>relationshipRegistry.get(edge.relationship)?.hierarchy); const children=new Map(graph.nodes.map((node)=>[node.id,[]])); const targets=new Set();
  for(const edge of hierarchy){children.get(edge.from).push(edge.to);targets.add(edge.to);}
  const roots=graph.nodes.filter((node)=>!targets.has(node.id)); if(graph.nodes.length&&roots.length!==1)fail("mapping_structure_root_count_invalid",{rootCount:roots.length});
  const visiting=new Set(),visited=new Set(); function visit(id){if(visiting.has(id))fail("mapping_structure_cycle",{nodeId:id});visiting.add(id);const result={id,children:(children.get(id)||[]).sort().map(visit)};visiting.delete(id);visited.add(id);return result;}
  const root=roots[0]?visit(roots[0].id):null;if(visited.size!==graph.nodes.length)fail("mapping_structure_orphan_node");const tree={modelVersion:model.modelVersion||null,root};return Object.freeze({...tree,hash:projectionHash(tree)});
}
function buildReusableFacets(model={}){return Object.freeze([...(model.facets||[])].map(canonicalize).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}
function buildReconciliationWorkItems({organizationId,publicationId,previousGraph,newGraph}){if(!previousGraph)return Object.freeze([]);const priorNodes=new Map((previousGraph.nodes||[]).map((node)=>[node.id,node]));const nextNodes=new Map((newGraph.nodes||[]).map((node)=>[node.id,node]));const priorEdges=new Set((previousGraph.edges||[]).map((edge)=>`${edge.from}:${edge.to}:${edge.relationship}`));const nextEdges=new Set((newGraph.edges||[]).map((edge)=>`${edge.from}:${edge.to}:${edge.relationship}`));const items=[];for(const id of priorNodes.keys())if(!nextNodes.has(id))items.push({targetType:"organization_model_node",targetId:id,impactClassification:"revalidation_required"});for(const key of priorEdges)if(!nextEdges.has(key))items.push({targetType:"organization_model_relationship",targetId:key,impactClassification:"source_relationship_stale"});return Object.freeze(items.map((item)=>Object.freeze({organizationId,publicationId,...item,status:"pending",grantsAccess:false})).sort((a,b)=>`${a.targetType}:${a.targetId}`.localeCompare(`${b.targetType}:${b.targetId}`)));}
module.exports={canonicalize,projectionHash,buildOrganizationGraph,buildPrimaryScopeTree,buildReusableFacets,buildReconciliationWorkItems};
