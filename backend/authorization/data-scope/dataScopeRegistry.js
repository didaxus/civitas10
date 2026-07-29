"use strict";
const {DATA_SCOPE_STRATEGY_REGISTRY,STRATEGY_NAMES,getDataScopeStrategy}=require("./dataScopeStrategyRegistry");
const STRATEGY_TYPES=STRATEGY_NAMES;
const RELATIONSHIP_KEYS=Object.freeze(["academic.assigned_group","academic.assigned_course","academic.related_student","planning.relationship","planning.editable","planning.owner","planning.assigned_review","planning.assigned_approval","planning.approved_plan","community.member","community.moderator","hr.managed_employee","hr.self","payroll.managed_employee","payroll.self","scheduling.participant","scheduling.owner","support.assignee","support.requester","communication.sender","communication.recipient"]);
const { DIMENSION_REGISTRY }=require("../../taxonomy/taxonomyDimensionRegistry");
const TAXONOMY_DIMENSION_KEYS=Object.freeze(Object.keys(DIMENSION_REGISTRY.dimensions));
const DATA_SCOPE_STRATEGIES=Object.freeze({
  organization_director:{ lms:{...DATA_SCOPE_STRATEGY_REGISTRY.organization}, analytics:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units}, reports:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units}},
  organization_headdirector:{ lms:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units,requiredDimensionKeys:Object.freeze(["academic.stage"])}},
  organization_headteacher:{ lms:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units,requiredDimensionKeys:Object.freeze(["academic.subject"])}, planning:{...DATA_SCOPE_STRATEGY_REGISTRY.planning_relationship}},
  organization_groupleader:{ lms:{...DATA_SCOPE_STRATEGY_REGISTRY.academic_relationship,relationshipKeys:Object.freeze(["academic.assigned_group"]),relationshipType:"leads"}},
  organization_teacher:{ lms:{...DATA_SCOPE_STRATEGY_REGISTRY.teaching_assignments}},
  organization_student:{ lms:{...DATA_SCOPE_STRATEGY_REGISTRY.self}},
  organization_parent:{ lms:{...DATA_SCOPE_STRATEGY_REGISTRY.academic_relationship,relationshipKeys:Object.freeze(["academic.related_student"])}},
  organization_member:{ community:{...DATA_SCOPE_STRATEGY_REGISTRY.community_membership}, scheduling:{...DATA_SCOPE_STRATEGY_REGISTRY.scheduling_relationship}, support:{...DATA_SCOPE_STRATEGY_REGISTRY.support_relationship}},
  organization_secretary:{ crm:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units}, scheduling:{...DATA_SCOPE_STRATEGY_REGISTRY.scheduling_relationship}, support:{...DATA_SCOPE_STRATEGY_REGISTRY.support_relationship}},
  organization_accountant:{ payments:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units}, reports:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units}},
  organization_billing:{ payments:{...DATA_SCOPE_STRATEGY_REGISTRY.organization_and_units}},
  organization_payroll:{ hr:{...DATA_SCOPE_STRATEGY_REGISTRY.payroll_relationship}}
});
function strategyFor({roleKey,capability}){return DATA_SCOPE_STRATEGIES[roleKey]?.[capability]||null;}
module.exports={STRATEGY_TYPES,RELATIONSHIP_KEYS,TAXONOMY_DIMENSION_KEYS,DATA_SCOPE_STRATEGIES,strategyFor};
