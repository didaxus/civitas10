'use strict';
const { hash, etag, parseEtag, stableRanks, validationRun } = require('../domain/authoring');

class PlanningAuthoringError extends Error { constructor(code, status, detail = code) { super(detail); this.code=code; this.status=status; } }
function requireContext(context, permission) {
  if (!context?.organizationId || !context?.actorId) throw new PlanningAuthoringError('authorization_context_invalid', 403);
  if (!context.permissions?.includes(permission)) throw new PlanningAuthoringError('forbidden', 403);
}
function createPlanningAuthoringService(repository, { validatorVersion='1' } = {}) {
  async function reorderUnits({ roadmapId, orderedIds, ifMatch, idempotencyKey }, context) {
    requireContext(context, 'planning.roadmaps.write');
    if (!idempotencyKey) throw new PlanningAuthoringError('idempotency_key_required', 400);
    if (!Array.isArray(orderedIds) || new Set(orderedIds).size !== orderedIds.length) throw new PlanningAuthoringError('invalid_order', 422);
    const requestHash = hash({ roadmapId, orderedIds, ifMatch });
    return repository.transaction(context.organizationId, async tx => {
      const replay = await tx.getIdempotency(idempotencyKey);
      if (replay) { if (replay.requestHash !== requestHash) throw new PlanningAuthoringError('idempotency_conflict',409); return replay.response; }
      const roadmap = await tx.lockRoadmap(roadmapId);
      if (!roadmap) throw new PlanningAuthoringError('not_found',404);
      const expected = parseEtag(ifMatch);
      if (expected === null) throw new PlanningAuthoringError('if_match_required',428);
      if (expected !== roadmap.version) throw new PlanningAuthoringError('etag_mismatch',412);
      const existing = await tx.listUnitIds(roadmapId);
      if (existing.length !== orderedIds.length || existing.some(id => !orderedIds.includes(id))) throw new PlanningAuthoringError('invalid_order',422);
      await tx.setUnitRanks(roadmapId, stableRanks(orderedIds));
      const version = roadmap.version + 1;
      await tx.setRoadmapVersion(roadmapId, version);
      const response = { roadmapId, version, etag: etag(version), units: stableRanks(orderedIds) };
      await tx.audit({ actorId:context.actorId, action:'planning.roadmap.units.reordered.v1', aggregateId:roadmapId, details:{ orderedIds, version } });
      await tx.outbox({ type:'planning.roadmap.units.reordered.v1', aggregateId:roadmapId, aggregateVersion:version, payload:response });
      await tx.putIdempotency(idempotencyKey, requestHash, response);
      return response;
    });
  }
  async function runValidation({ blueprintId, idempotencyKey }, context) {
    requireContext(context, 'planning.assessments.validate');
    if (!idempotencyKey) throw new PlanningAuthoringError('idempotency_key_required',400);
    return repository.transaction(context.organizationId, async tx => {
      const input = await tx.loadValidationInput(blueprintId);
      if (!input.blueprint) throw new PlanningAuthoringError('not_found',404);
      const run = validationRun({ organizationId:context.organizationId, ...input, validatorVersion });
      const requestHash=hash({blueprintId,inputHash:run.inputHash,validatorVersion});
      const replay=await tx.getIdempotency(idempotencyKey);
      if(replay){if(replay.requestHash!==requestHash)throw new PlanningAuthoringError('idempotency_conflict',409);return replay.response;}
      const saved=await tx.upsertValidationRun(run);
      await tx.audit({actorId:context.actorId,action:'planning.validation.completed.v1',aggregateId:blueprintId,details:{runId:saved.id,inputHash:run.inputHash,status:run.status}});
      await tx.outbox({type:'planning.validation.completed.v1',aggregateId:blueprintId,aggregateVersion:run.inputHash,payload:saved});
      await tx.putIdempotency(idempotencyKey,requestHash,saved);
      return saved;
    });
  }
  return Object.freeze({ reorderUnits, runValidation });
}
module.exports={ createPlanningAuthoringService, PlanningAuthoringError };
