"use strict";

const { getPool } = require("../../lib/db");

function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
function assignmentKey(a) { return [a.logtoOrganizationId, a.membershipId, a.canonicalRoleId, a.capability, a.scopeKind, a.dimensionKey || a.relationshipKey, a.dimensionValueId || a.unitId || a.resourceRef].join("::"); }
function camel(row) {
  if (!row) return row;
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_m, letter) => letter.toUpperCase()), value]));
}
function encodeCursor(row) { return Buffer.from(JSON.stringify([row.createdAt, row.id])).toString("base64url"); }
function decodeCursor(cursor) {
  if (!cursor) return null;
  try { const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString()); if (!Array.isArray(parsed) || parsed.length !== 2) throw new Error(); return parsed; }
  catch (_error) { const error = new Error("data_scope_cursor_invalid"); error.code = "data_scope_cursor_invalid"; throw error; }
}

function createInMemoryDataScopeRepository() {
  const assignments = new Map(); const versions = new Map(); const outbox = []; const audits = [];
  const repository = {
    outbox, audits,
    async transaction(fn) { const a = new Map([...assignments].map(([k,v])=>[k,clone(v)])); const ver = new Map(versions); const o=outbox.length; const u=audits.length; try{return await fn(this);}catch(error){assignments.clear();for(const x of a)assignments.set(...x);versions.clear();for(const x of ver)versions.set(...x);outbox.length=o;audits.length=u;throw error;} },
    async getPolicyVersion(organizationId) { return versions.get(organizationId) || 1; },
    async incrementPolicyVersion(organizationId) { const next=(versions.get(organizationId)||1)+1;versions.set(organizationId,next);return next; },
    async insertAssignment(row) { for(const a of assignments.values()) if(["scheduled","active"].includes(a.status)&&["scheduled","active"].includes(row.status||"active")&&assignmentKey(a)===assignmentKey(row)){const e=new Error("data_scope_assignment_duplicate");e.code=e.message;throw e;} const saved={status:"active",metadata:{},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),...row,id:row.id||`scope_${assignments.size+1}`};assignments.set(saved.id,saved);return clone(saved); },
    async updateAssignment(id, patch, { organizationId, fromStatuses, expectedPolicyVersion }={}) { if(expectedPolicyVersion!=null&&Number(expectedPolicyVersion)!==Number(await this.getPolicyVersion(organizationId))){const e=new Error("authorization_policy_version_conflict");e.code=e.message;throw e;} const current=assignments.get(id);if(!current||organizationId&&current.logtoOrganizationId!==organizationId||fromStatuses&&!fromStatuses.includes(current.status))return null;const saved={...current,...patch,updatedAt:new Date().toISOString()};assignments.set(id,saved);return clone(saved); },
    async getAssignment(id, organizationId) { const row=assignments.get(id);return clone(row&&(!organizationId||row.logtoOrganizationId===organizationId)?row:null); },
    async listAssignments(input={}) { const {organizationId,userId,membershipId,roleId,canonicalRoleId,capability,status,limit=100,cursor}=input;let rows=[...assignments.values()].filter(a=>(!organizationId||a.logtoOrganizationId===organizationId)&&(!userId||a.logtoUserId===userId)&&(!membershipId||a.membershipId===membershipId)&&(!roleId||a.logtoRoleId===roleId)&&(!canonicalRoleId||a.canonicalRoleId===canonicalRoleId)&&(!capability||a.capability===capability)&&(!status||a.status===status)).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt))||String(a.id).localeCompare(String(b.id)));const after=decodeCursor(cursor);if(after)rows=rows.filter(a=>a.createdAt>after[0]||(a.createdAt===after[0]&&a.id>after[1]));const page=rows.slice(0,Math.min(Number(limit)||100,200));page.nextCursor=rows.length>page.length?encodeCursor(page.at(-1)):null;return clone(page); },
    async recordOutbox(event){outbox.push(clone(event));return clone(event);}, async audit(event){audits.push(clone(event));return clone(event);}
  }; return repository;
}

function createPostgresDataScopeRepository({ pool = null } = {}) {
  pool = pool || new Proxy({}, { get(_target, property) { const value=getPool()[property]; return typeof value === "function" ? value.bind(getPool()) : value; } });
  function build(client) {
    return {
      async transaction(fn) { const connection=await client.connect();try{await connection.query("begin");const result=await fn(build(connection));await connection.query("commit");return result;}catch(error){await connection.query("rollback");throw error;}finally{connection.release();} },
      async getPolicyVersion(organizationId) { const {rows}=await client.query("select version from authorization_policy_versions where logto_organization_id=$1",[organizationId]);return Number(rows[0]?.version||1); },
      async incrementPolicyVersion(organizationId, { actorUserId=null, reason="data_scope_assignment_mutation" }={}) { const {rows}=await client.query(`insert into authorization_policy_versions(logto_organization_id,version,catalog_version,reason,updated_by_logto_user_id) values($1,2,'1',$2,$3) on conflict(logto_organization_id) do update set version=authorization_policy_versions.version+1,reason=excluded.reason,updated_by_logto_user_id=excluded.updated_by_logto_user_id,updated_at=now() returning version`,[organizationId,reason,actorUserId]);return Number(rows[0].version); },
      async insertAssignment(row) { const columns={logtoOrganizationId:"logto_organization_id",logtoUserId:"logto_user_id",membershipId:"membership_id",logtoRoleId:"logto_role_id",canonicalRoleId:"canonical_role_id",scopeTemplateId:"scope_template_id",scopeTemplateVersion:"scope_template_version",strategyId:"strategy_id",capability:"capability",scopeKind:"scope_kind",dimensionKey:"dimension_key",relationshipKey:"relationship_key",dimensionValueId:"dimension_value_id",unitId:"unit_id",resourceRef:"resource_ref",target:"target",sourceType:"source_type",sourceRef:"source_ref",sourceVersion:"source_version",provenance:"provenance",status:"status",snapshotVersion:"snapshot_version",assignedByLogtoUserId:"assigned_by_logto_user_id",reason:"reason",validFrom:"valid_from",validUntil:"valid_until",metadata:"metadata"};const entries=Object.entries(columns).filter(([key])=>row[key]!==undefined);const values=entries.map(([key])=>["target","provenance","metadata"].includes(key)?JSON.stringify(row[key]):row[key]);try{const {rows}=await client.query(`insert into authorization_scope_assignments(${entries.map(([,c])=>c).join(",")}) values(${entries.map((_e,i)=>`$${i+1}`).join(",")}) returning *`,values);return camel(rows[0]);}catch(error){if(error.code==="23505"){error.code="data_scope_assignment_duplicate";error.message=error.code;}throw error;} },
      async getAssignment(id, organizationId) { const {rows}=await client.query(`select * from authorization_scope_assignments where id=$1${organizationId?" and logto_organization_id=$2":""}`,[id,...(organizationId?[organizationId]:[])]);return camel(rows[0]); },
      async updateAssignment(id, patch, {organizationId,fromStatuses=[]}={}) { const allowed={status:"status",revokedAt:"revoked_at",revokedByLogtoUserId:"revoked_by_logto_user_id",reason:"reason"};const entries=Object.entries(allowed).filter(([key])=>patch[key]!==undefined);const values=entries.map(([key])=>patch[key]);values.push(id,organizationId,...fromStatuses);const statusSql=fromStatuses.length?` and status = any($${entries.length+3}::varchar[])`:"";const {rows}=await client.query(`update authorization_scope_assignments set ${entries.map(([,c],i)=>`${c}=$${i+1}`).join(",")},updated_at=now() where id=$${entries.length+1} and logto_organization_id=$${entries.length+2}${statusSql} returning *`,values);return camel(rows[0]); },
      async listAssignments(input={}) { const clauses=[],values=[];for(const [key,column] of Object.entries({organizationId:"logto_organization_id",userId:"logto_user_id",membershipId:"membership_id",roleId:"logto_role_id",canonicalRoleId:"canonical_role_id",capability:"capability",status:"status"}))if(input[key]){values.push(input[key]);clauses.push(`${column}=$${values.length}`);}const after=decodeCursor(input.cursor);if(after){values.push(after[0],after[1]);clauses.push(`(created_at,id)>($${values.length-1}::timestamptz,$${values.length}::uuid)`);}const limit=Math.min(Number(input.limit)||100,200);values.push(limit+1);const {rows}=await client.query(`select * from authorization_scope_assignments${clauses.length?` where ${clauses.join(" and ")}`:""} order by created_at,id limit $${values.length}`,values);const result=rows.slice(0,limit).map(camel);result.nextCursor=rows.length>limit?encodeCursor(result.at(-1)):null;return result; },
      async recordOutbox(event) { const payload={schemaVersion:"1",policyVersion:String(event.policyVersion),assignmentId:event.assignmentId};const {rows}=await client.query(`insert into authorization_outbox_events(event_type,aggregate_type,aggregate_id,event_version,logto_organization_id,subject_logto_user_id,payload) values($1,'data_scope_assignment',$2,$3,$4,$5,$6::jsonb) returning *`,[event.eventType,event.assignmentId,String(event.policyVersion),event.organizationId,event.subjectLogtoUserId||null,JSON.stringify(payload)]);return camel(rows[0]); },
      async audit(event) { const {rows}=await client.query(`insert into audit_logs(logto_organization_id,actor_logto_user_id,action,target_type,target_id,metadata) values($1,$2,$3,'data_scope_assignment',$4,$5::jsonb) returning *`,[event.organizationId,event.actorLogtoUserId||event.actorUserId||null,event.action||event.eventType,event.assignmentId||null,JSON.stringify({policyVersion:event.policyVersion,reason:event.reason})]);return camel(rows[0]); }
    };
  } return build(pool);
}

module.exports={createInMemoryDataScopeRepository,createPostgresDataScopeRepository,encodeCursor,decodeCursor};
