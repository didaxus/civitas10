"use strict";
const { createUnitService } = require("./unitService");
const { bumpVersion } = require("./structureVersionsService");
const { structureError, ORGANIZATION_STRUCTURE_REASON_CODES: C } = require("./organizationStructureReasonCodes");
const { parseCreateUnitDto, parseMoveUnitDto, parseUpdateUnitDto } = require("./unitDtos");
const { withManagementLevelOrder } = require("./managementLevelCatalog");

function createUnitMutationService({ repository, taxonomyPort, impactService }={}) {
  if (!repository) throw new Error("repository_required");
  const run = (work) => repository.transaction(work);
  const service = (tx) => createUnitService({ repository: tx, taxonomyPort, impactService });
  return {
    create(input) { const dto=parseCreateUnitDto(input.body); return run((tx)=>service(tx).createUnit({...dto,organizationId:input.organizationId,actorLogtoUserId:input.actorLogtoUserId,expectedStructureVersion:input.expectedStructureVersion})); },
    move(input) { const dto=parseMoveUnitDto(input.body); return run((tx)=>service(tx).reparentUnit({organizationId:input.organizationId,unitId:input.unitId,parentUnitId:dto.parentUnitId,actorLogtoUserId:input.actorLogtoUserId,expectedStructureVersion:input.expectedStructureVersion})); },
    archive(input) { return run((tx)=>service(tx).archiveUnit({organizationId:input.organizationId,unitId:input.unitId,actorLogtoUserId:input.actorLogtoUserId,expectedStructureVersion:input.expectedStructureVersion})); },
    update(input) { const dto=parseUpdateUnitDto(input.body); return run(async(tx)=>{const unit=await tx.getUnit(input.unitId);if(!unit)throw structureError(C.UNIT_NOT_FOUND);if(unit.logtoOrganizationId!==input.organizationId)throw structureError(C.UNIT_WRONG_TENANT);const current=await tx.getVersions(input.organizationId);if(Number(input.expectedStructureVersion)!==Number(current.unitGraphVersion))throw structureError(C.STRUCTURE_VERSION_CONFLICT);const saved=await tx.updateUnit(input.unitId,{...dto,updatedByLogtoUserId:input.actorLogtoUserId});const versions=await bumpVersion({repository:tx,organizationId:input.organizationId,kind:"graph",actorLogtoUserId:input.actorLogtoUserId,expectedVersion:input.expectedStructureVersion,reason:"organization.unit.updated"});const event={eventType:"organization.unit.updated",action:"organization.unit.updated",organizationId:input.organizationId,actorLogtoUserId:input.actorLogtoUserId,unitId:input.unitId,structureVersions:versions};await tx.recordOutbox(event);await tx.audit(event);return withManagementLevelOrder(saved)}); }
  };
}
module.exports={createUnitMutationService};
