"use strict";
const crypto=require("crypto");
const DATA_SCOPE_STRATEGY_VERSION="2026-07-civitas-data-scope-strategies-v2";
const STRATEGY_NAMES=Object.freeze(["global_owner","organization","organization_and_units","self","self_or_organization","academic_relationship","teaching_assignments","planning_relationship","planning_editable","planning_owned","assigned_reviews","assigned_approvals","approved_plans","community_membership","community_moderation","hr_relationship","payroll_relationship","scheduling_relationship","support_relationship","communication_relationship"]);
const relationship=(name,relationshipKeys,acceptedDimensionKeys=[])=>Object.freeze({name,strategyId:name,version:DATA_SCOPE_STRATEGY_VERSION,resolverKind:"relationship",requiresAssignment:true,requiredFacts:Object.freeze(["rolePath","subject","tenant","relationshipCandidates"]),inputFacts:Object.freeze(["rolePath","subject","tenant","relationshipCandidates"]),output:Object.freeze(["queryConstraints","resourceAssertions"]),outputConstraint:"relationships",acceptedDimensionKeys:Object.freeze(acceptedDimensionKeys),denialReasons:Object.freeze(["data_scope_assignment_missing","data_scope_relationship_stale","data_scope_resource_wrong_tenant"]),relationshipKeys:Object.freeze(relationshipKeys)});
const DATA_SCOPE_STRATEGY_REGISTRY=Object.freeze({
  global_owner:Object.freeze({name:"global_owner",version:DATA_SCOPE_STRATEGY_VERSION,resolverKind:"global_owner",requiresAssignment:false,inputFacts:Object.freeze(["ownerSubject"]),outputConstraint:"global_owner",denialReasons:Object.freeze(["data_scope_role_mismatch"])}),
  organization:Object.freeze({name:"organization",version:DATA_SCOPE_STRATEGY_VERSION,resolverKind:"organization",requiresAssignment:false,inputFacts:Object.freeze(["tenant"]),outputConstraint:"organization",denialReasons:Object.freeze(["data_scope_resource_wrong_tenant"])}),
  organization_and_units:Object.freeze({name:"organization_and_units",version:DATA_SCOPE_STRATEGY_VERSION,resolverKind:"assignment",requiresAssignment:true,inputFacts:Object.freeze(["tenant","activeUnits","assignments"]),outputConstraint:"dimensions",denialReasons:Object.freeze(["data_scope_assignment_missing","data_scope_unit_inactive","data_scope_unit_wrong_tenant"]),requiredDimensionKeys:Object.freeze(["organization.department"])}),
  self:Object.freeze({name:"self",version:DATA_SCOPE_STRATEGY_VERSION,resolverKind:"self",requiresAssignment:false,inputFacts:Object.freeze(["subject"]),outputConstraint:"self",denialReasons:Object.freeze(["data_scope_resource_forbidden"])}),
  self_or_organization:Object.freeze({name:"self_or_organization",version:DATA_SCOPE_STRATEGY_VERSION,resolverKind:"self_or_organization",requiresAssignment:false,inputFacts:Object.freeze(["subject","tenant"]),outputConstraint:"self_or_organization",denialReasons:Object.freeze(["data_scope_resource_forbidden"])}),
  academic_relationship:relationship("academic_relationship",["academic.assigned_group","academic.assigned_course","academic.related_student"]),
  teaching_assignments:relationship("teaching_assignments",["academic.assigned_group","academic.assigned_course"],["academic.course","academic.class"]),
  planning_relationship:relationship("planning_relationship",["planning.relationship"]),
  planning_editable:relationship("planning_editable",["planning.editable"]),
  planning_owned:relationship("planning_owned",["planning.owner"]),
  assigned_reviews:relationship("assigned_reviews",["planning.assigned_review"]),
  assigned_approvals:relationship("assigned_approvals",["planning.assigned_approval"]),
  approved_plans:relationship("approved_plans",["planning.approved_plan"]),
  community_membership:relationship("community_membership",["community.member"]),
  community_moderation:relationship("community_moderation",["community.moderator"]),
  hr_relationship:relationship("hr_relationship",["hr.managed_employee","hr.self"]),
  payroll_relationship:relationship("payroll_relationship",["payroll.managed_employee","payroll.self"]),
  scheduling_relationship:relationship("scheduling_relationship",["scheduling.participant","scheduling.owner"]),
  support_relationship:relationship("support_relationship",["support.assignee","support.requester"]),
  communication_relationship:relationship("communication_relationship",["communication.sender","communication.recipient"]),
});
function getDataScopeStrategy(name){return DATA_SCOPE_STRATEGY_REGISTRY[name]||null;}
function assertDataScopeStrategy(name){const strategy=getDataScopeStrategy(name); if(!strategy){const error=new Error("data_scope_strategy_unknown"); error.code="data_scope_strategy_unknown"; throw error;} return strategy;}
const DATA_SCOPE_STRATEGY_REGISTRY_HASH=crypto.createHash("sha256").update(JSON.stringify(DATA_SCOPE_STRATEGY_REGISTRY)).digest("hex");
module.exports={DATA_SCOPE_STRATEGY_VERSION,DATA_SCOPE_STRATEGY_REGISTRY_HASH,STRATEGY_NAMES,DATA_SCOPE_STRATEGY_REGISTRY,getDataScopeStrategy,assertDataScopeStrategy};
