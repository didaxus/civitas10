'use strict'
const crypto = require('crypto')
const DATA_SCOPE_DIMENSION_REGISTRY_VERSION = '2026-07-civitas-data-scope-dimensions-v2'
const definitions = [
  ['academic.stage','Academic stage','Broad institutional stage or cycle; never a concrete class.','stable_id','tree',true,['lms','analytics','planning']],
  ['academic.period','Academic period','Explicit academic time period referenced by stable ID.','stable_id','none',true,['lms','analytics','planning','scheduling']],
  ['academic.subject','Academic subject','Academic discipline, distinct from course and class.','stable_id','none',true,['lms','analytics','planning']],
  ['academic.course','Academic course','Curricular course definition, not a concrete offering.','stable_id','none',true,['lms','analytics','planning','scheduling']],
  ['academic.cohort','Academic cohort','Population grouped by intake, promotion, or trajectory.','stable_id','none',true,['lms','analytics','planning']],
  ['academic.class','Academic class','Concrete course offering with operational relationships.','stable_id','none',true,['lms','analytics','planning','scheduling']],
  ['organization.campus','Campus','Physical or virtual institutional campus.','stable_id','tree',true,['lms','scheduling','analytics']],
  ['organization.shift','Shift','Institutional operating shift.','stable_id','none',true,['lms','scheduling','analytics']],
  ['organization.department','Department','Organizational department.','stable_id','tree',true,['crm','support','analytics','payments','hr']],
  ['administration.function','Administrative function','Cross-cutting administrative function.','stable_id','none',true,['support','analytics','payments','crm']],
]
const TAXONOMY_DIMENSIONS=Object.freeze(Object.fromEntries(definitions.map(([key,displayName,description,valueKind,hierarchyBehavior,allowMultiple,allowedCapabilities])=>[key,Object.freeze({key,displayName,description,valueKind,hierarchyBehavior,allowMultiple,tenantOwnershipRequired:true,allowedCapabilities:Object.freeze(allowedCapabilities),lifecycle:'active',authorizationImpact:'restrictive_only'})])))
const TAXONOMY_DIMENSION_KEYS=Object.freeze(Object.keys(TAXONOMY_DIMENSIONS))
const DATA_SCOPE_DIMENSION_REGISTRY_HASH=crypto.createHash('sha256').update(JSON.stringify(TAXONOMY_DIMENSIONS)).digest('hex')
function getTaxonomyDimension(key){return TAXONOMY_DIMENSIONS[key]||null}
function assertTaxonomyDimension(key){const value=getTaxonomyDimension(key);if(!value){const error=new Error('taxonomy_dimension_unknown');error.code='taxonomy_dimension_unknown';throw error}return value}
module.exports={DATA_SCOPE_DIMENSION_REGISTRY_VERSION,DATA_SCOPE_DIMENSION_REGISTRY_HASH,TAXONOMY_DIMENSIONS,TAXONOMY_DIMENSION_KEYS,getTaxonomyDimension,assertTaxonomyDimension}
