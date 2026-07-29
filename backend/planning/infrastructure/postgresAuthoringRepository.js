'use strict';
const { randomUUID } = require('node:crypto');

function createPostgresAuthoringRepository(pool) {
  return { async transaction(organizationId, work) {
    const client=await pool.connect();
    try { await client.query('begin'); await client.query("select set_config('app.organization_id',$1,true)",[organizationId]);
      const q=(text,params=[])=>client.query(text,params);
      const tx={
        async getIdempotency(key){const {rows}=await q('select request_hash,response from planning_authoring_idempotency where organization_id=$1 and idempotency_key=$2',[organizationId,key]);return rows[0]&&{requestHash:rows[0].request_hash,response:rows[0].response};},
        async putIdempotency(key,requestHash,response){await q('insert into planning_authoring_idempotency values($1,$2,$3,$4)',[organizationId,key,requestHash,response]);},
        async lockRoadmap(id){const {rows}=await q('select id,version from planning_roadmaps where organization_id=$1 and id=$2 for update',[organizationId,id]);return rows[0]&&{id:rows[0].id,version:Number(rows[0].version)};},
        async listUnitIds(id){const {rows}=await q('select id from planning_units where organization_id=$1 and roadmap_id=$2 order by rank,id',[organizationId,id]);return rows.map(r=>r.id);},
        async setUnitRanks(roadmapId,ranks){await q('update planning_units set rank=rank+1000000000000000 where organization_id=$1 and roadmap_id=$2',[organizationId,roadmapId]);for(const item of ranks)await q('update planning_units set rank=$4 where organization_id=$1 and roadmap_id=$2 and id=$3',[organizationId,roadmapId,item.id,item.rank]);},
        async setRoadmapVersion(id,version){await q('update planning_roadmaps set version=$3,updated_at=now() where organization_id=$1 and id=$2',[organizationId,id,version]);},
        async loadValidationInput(id){const {rows:b}=await q('select id,name,calibration_id as "calibrationId",version from planning_assessment_blueprints where organization_id=$1 and id=$2',[organizationId,id]);if(!b[0])return {blueprint:null,components:[],calibration:null};const {rows:c}=await q('select id,kind,weight::float8,config,rank from planning_assessment_components where organization_id=$1 and blueprint_id=$2 order by rank,id',[organizationId,id]);const {rows:k}=await q('select id,taxonomy_version as "taxonomyVersion",rules,version from planning_calibrations where organization_id=$1 and id=$2',[organizationId,b[0].calibrationId]);return {blueprint:b[0],components:c,calibration:k[0]||null};},
        async upsertValidationRun(run){const {rows}=await q(`insert into planning_validation_runs(organization_id,id,blueprint_id,input_hash,validator_version,status,findings) values($1,$2,$3,$4,$5,$6,$7) on conflict(organization_id,blueprint_id,input_hash,validator_version) do update set input_hash=excluded.input_hash returning id,blueprint_id as "blueprintId",input_hash as "inputHash",validator_version as "validatorVersion",status,findings`,[organizationId,run.id,run.blueprintId,run.inputHash,run.validatorVersion,run.status,run.findings]);return rows[0];},
        async audit(e){await q('insert into planning_authoring_audit(organization_id,id,actor_id,action,aggregate_id,details) values($1,$2,$3,$4,$5,$6)',[organizationId,randomUUID(),e.actorId,e.action,e.aggregateId,e.details]);},
        async outbox(e){const id=randomUUID();await q(`insert into integration_outbox_events(id,event_id,event_type,schema_version,logto_organization_id,aggregate_type,aggregate_id,aggregate_version,actor_json,correlation_id,source_json,sensitivity,payload) values($1,$1,$2,'1',$3,'planning.authoring',$4,$5,'{}',$1::text,'{"service":"planning"}','internal',$6)`,[id,e.type,organizationId,e.aggregateId,String(e.aggregateVersion),e.payload]);}
      };
      const result=await work(tx);await client.query('commit');return result;
    } catch(error){await client.query('rollback');throw error;} finally{client.release();}
  }};
}
module.exports={createPostgresAuthoringRepository};
