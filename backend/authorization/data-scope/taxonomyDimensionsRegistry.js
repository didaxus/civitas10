'use strict'
const crypto = require('crypto')
const { DIMENSION_REGISTRY } = require('../../taxonomy/taxonomyDimensionRegistry')
const DATA_SCOPE_DIMENSION_REGISTRY_VERSION = DIMENSION_REGISTRY.version
const runtimeMetadata = {
  'academic.stage':['Academic stage','Broad institutional stage or cycle; not a grade, cohort, or concrete class.','tree',['lms','analytics','planning']],
  'academic.period':['Academic period','Explicit academic time period referenced by stable ID.','none',['lms','analytics','planning','scheduling']],
  'academic.subject':['Academic subject','Academic discipline, distinct from course and class.','none',['lms','analytics','planning']],
  'academic.course':['Academic course','Curricular course definition, not a concrete offering.','none',['lms','analytics','planning','scheduling']],
  'academic.cohort':['Academic cohort','Population grouped by intake, promotion, or trajectory.','none',['lms','analytics','planning']],
  'academic.class':['Academic class','Concrete course offering with operational relationships.','none',['lms','analytics','planning','scheduling']],
  'organization.campus':['Campus','Physical or virtual institutional campus.','tree',['lms','scheduling','analytics']],
  'organization.shift':['Shift','Institutional operating shift.','none',['lms','scheduling','analytics']],
  'organization.department':['Department','Organizational department.','tree',['crm','support','analytics','payments','hr']],
  'administration.function':['Administrative function','Cross-cutting administrative function.','none',['support','analytics','payments','crm']],
}
const TAXONOMY_DIMENSIONS=Object.freeze(Object.fromEntries(DIMENSION_REGISTRY.dimensions.map(({id:key,semanticDefinition})=>{const metadata=runtimeMetadata[key]||[key,semanticDefinition,'none',['lms','analytics','planning']];const [displayName,description,hierarchyBehavior,allowedCapabilities]=metadata;return [key,Object.freeze({key,displayName,description,valueKind:'stable_id',hierarchyBehavior,allowMultiple:true,tenantOwnershipRequired:true,allowedCapabilities:Object.freeze(allowedCapabilities),lifecycle:'active',authorizationImpact:'restrictive_only'})]})))
const TAXONOMY_DIMENSION_KEYS=Object.freeze(Object.keys(TAXONOMY_DIMENSIONS))
const DATA_SCOPE_DIMENSION_REGISTRY_HASH=crypto.createHash('sha256').update(JSON.stringify(TAXONOMY_DIMENSIONS)).digest('hex')
function getTaxonomyDimension(key){return TAXONOMY_DIMENSIONS[key]||null}
function assertTaxonomyDimension(key){const value=getTaxonomyDimension(key);if(!value){const error=new Error('taxonomy_dimension_unknown');error.code='taxonomy_dimension_unknown';throw error}return value}
module.exports={DATA_SCOPE_DIMENSION_REGISTRY_VERSION,DATA_SCOPE_DIMENSION_REGISTRY_HASH,TAXONOMY_DIMENSIONS,TAXONOMY_DIMENSION_KEYS,getTaxonomyDimension,assertTaxonomyDimension}
