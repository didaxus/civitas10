'use strict'
const test=require('node:test')
const assert=require('node:assert/strict')
const scope=require('../authorization/data-scope')
const { resourceMatchesConstraint }=scope

const frozen=['academic.stage','academic.period','academic.subject','academic.course','academic.cohort','academic.class','organization.campus','organization.shift','organization.department','administration.function']

test('taxonomy dimension registry v2 is the exact single canonical vocabulary',()=>{
  assert.equal(scope.DATA_SCOPE_DIMENSION_REGISTRY_VERSION,'2026-07-civitas-data-scope-dimensions-v2')
  assert.deepEqual(scope.TAXONOMY_DIMENSION_KEYS,frozen)
  assert.throws(()=>scope.assertTaxonomyDimension('academic.'+'section'),/taxonomy_dimension_unknown/)
  assert.throws(()=>scope.assertTaxonomyDimension('academic.'+'grade_level'),/taxonomy_dimension_unknown/)
  for(const key of frozen){const dimension=scope.assertTaxonomyDimension(key);assert.equal(dimension.key,key);assert.equal(dimension.tenantOwnershipRequired,true);assert.equal(dimension.authorizationImpact,'restrictive_only')}
})

test('stage, period, subject, course, cohort, and class remain distinct stable-ID concepts',()=>{
  const keys=['academic.stage','academic.period','academic.subject','academic.course','academic.cohort','academic.class']
  assert.equal(new Set(keys.map(key=>scope.TAXONOMY_DIMENSIONS[key].description)).size,keys.length)
  assert.equal(scope.TAXONOMY_DIMENSIONS['academic.period'].valueKind,'stable_id')
  assert.match(scope.TAXONOMY_DIMENSIONS['academic.stage'].description,/never a concrete class/)
})

test('strategy, dimensions, and templates are separate compatible contracts',()=>{
  assert.notEqual(scope.TAXONOMY_DIMENSIONS,scope.DATA_SCOPE_STRATEGY_REGISTRY)
  assert.equal(scope.DATA_SCOPE_STRATEGY_VERSION,'2026-07-civitas-data-scope-strategies-v2')
  assert.equal(scope.OWNER_SCOPE_TEMPLATE_VERSION,'2026-07-owner-scope-templates-v2')
  assert.equal(scope.assertScopeTemplateContracts(),true)
  const teacher=scope.OWNER_SCOPE_TEMPLATES.find(template=>template.id==='teacher_lms_restricted_v2')
  assert.deepEqual(teacher.allowedDimensionKeys,['academic.course','academic.class'])
  assert.equal(teacher.strategyId,'teaching_assignments');assert.equal(teacher.requiredAssignment,true);assert.equal(teacher.allowOrganizationWide,false)
})

test('class constraint restricts 7B and does not autonomously grant 7A or organization-wide access',()=>{
  const constraint={kind:'dimensions',clauses:[{dimensionKey:'academic.class',operator:'in',valueIds:['class_7B']}]}
  assert.equal(resourceMatchesConstraint({organizationId:'org',dimensions:{'academic.class':'class_7B'}},constraint),true)
  assert.equal(resourceMatchesConstraint({organizationId:'org',dimensions:{'academic.class':'class_7A'}},constraint),false)
  assert.notEqual(constraint.kind,'organization')
})

test('restricted strategy with missing assignment or relationship denies',()=>{
  const result=scope.composeRolePathConstraint({strategy:scope.DATA_SCOPE_STRATEGY_REGISTRY.teaching_assignments,organizationId:'org',subjectId:'teacher',assignments:[],candidates:[]})
  assert.equal(result.kind,'deny');assert.equal(result.reasonCode,'data_scope_assignment_missing')
})

test('durable assignments require membership, canonical role, governed template and exact strategy',async()=>{
  const repository=scope.createInMemoryDataScopeRepository();const service=scope.createDataScopeAssignmentService({repository,taxonomyPort:{async resolvePublishedDimensionValue(){return{status:'active',value:{logtoOrganizationId:'org'}}}}})
  await assert.rejects(()=>service.createAssignment({organizationId:'org',userId:'teacher',canonicalRoleId:'organization_teacher',logtoRoleId:'role_teacher',membershipId:'membership_123',capability:'lms',scopeKind:'dimension',dimensionKey:'academic.class',dimensionValueId:'class_7B',actorLogtoUserId:'admin'}),/scope_template_not_found/)
})

test('unit and resource targets fail closed when ownership resolvers are absent',async()=>{
  const repository=scope.createInMemoryDataScopeRepository();const role='organization_teacher';const strategyId='teaching_assignments';const template={id:'teacher_lms_restricted_v2',version:scope.OWNER_SCOPE_TEMPLATE_VERSION,lifecycle:'published',capability:'lms',strategyId,allowedTargetKinds:['unit','resource'],allowedDimensionKeys:[],allowedRelationshipKeys:['academic.assigned_group','academic.assigned_course'],allowedRoleKeys:[role]};const templateRegistry={getTemplate(){return template},isAvailable(){return true},getTenantConfiguration(){return{enabled:true}}};const membershipPort={async getMembershipRoleBinding(input){return{...input}}};const service=scope.createDataScopeAssignmentService({repository,taxonomyPort:{},templateRegistry,membershipPort});const base={organizationId:'org',userId:'teacher',membershipId:'membership_123',canonicalRoleId:role,logtoRoleId:'role_teacher',scopeTemplateId:template.id,scopeTemplateVersion:template.version,strategyId,capability:'lms',actorLogtoUserId:'admin'};
  await assert.rejects(()=>service.createAssignment({...base,scopeKind:'unit',relationshipKey:'academic.assigned_group',unitId:'unit_123'}),{code:'data_scope_resolver_unavailable'});await assert.rejects(()=>service.createAssignment({...base,scopeKind:'resource',relationshipKey:'academic.assigned_course',resourceRef:'course_123'}),{code:'data_scope_resolver_unavailable'});
})

test('taxonomy migration upserts and verifies all ten canonical definitions',()=>{const fs=require('node:fs');const path=require('node:path');const sql=fs.readFileSync(path.join(__dirname,'../db/migrations/0025_data_scope_taxonomy_v2.sql'),'utf8');for(const key of frozen)assert.match(sql,new RegExp(key.replace('.','\\.')));assert.match(sql,/count\(\*\).*<> 10/s);assert.match(sql,/on conflict\(dimension_key\) do update/)})
