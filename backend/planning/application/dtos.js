// Public DTOs follow contracts/openapi/modules/planning.yaml. Persistence and
// runtime aliases are accepted only at this boundary and never leak publicly.
function planDto(input){ return Object.freeze({ id:String(input.id ?? input.planId), title:String(input.title||''), description:input.description ?? null, status:input.status||'draft', version:String(input.version||input.etag||'1'), updatedAt:input.updatedAt||new Date(0).toISOString() }); }
function pageDto(input){ const source=input.data||input.items||[]; const page=input.page||{}; return Object.freeze({ data:source.map(planDto), page:Object.freeze({ nextCursor:page.nextCursor||null, hasMore:page.hasMore ?? Boolean(page.nextCursor) }), links:Object.freeze(input.links||{}), meta:Object.freeze(input.meta||{}) }); }
function profileDto(input){ return Object.freeze({ organizationId:String(input.organizationId), planningMode:input.planningMode||'standard', preferences:Object.freeze({ fiscalYearStart:input.preferences?.fiscalYearStart||'01-01' }), version:String(input.version||'1'), updatedAt:input.updatedAt||new Date(0).toISOString() }); }
function envelopeDto(data, meta={}){ return Object.freeze({ data, meta:Object.freeze(meta) }); }
module.exports = { planDto, pageDto, profileDto, envelopeDto };
