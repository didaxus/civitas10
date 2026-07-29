function planDto(input){
  const title = input.title ?? input.name ?? '';
  const content = input.content ?? input.description;
  return Object.freeze({ planId:String(input.planId), organizationId:String(input.organizationId), title, name:input.name ?? title,
    ...(content !== undefined ? { description:input.description ?? content, content } : {}), status:input.status||'draft',
    version:String(input.version||input.etag||'1'), archived:!!input.archived, updatedAt:input.updatedAt||new Date(0).toISOString() });
}
function pageDto(input){ return Object.freeze({ items:(input.items||[]).map(planDto), page:{ cursor:input.page?.cursor||null, nextCursor:input.page?.nextCursor||input.nextCursor||null, limit:Number(input.page?.limit||input.limit||50) } }); }
function profileDto(input){
  const configuration = input.configuration ?? input.profile ?? {};
  const planningMode = input.planningMode ?? configuration.planningMode;
  const preferences = input.preferences ?? configuration.preferences ?? {};
  return Object.freeze({ organizationId:String(input.organizationId), profileId:input.profileId, planningMode, preferences:Object.freeze(structuredClone(preferences)),
    configuration:Object.freeze(structuredClone({ ...configuration, ...(planningMode !== undefined ? { planningMode } : {}), preferences })),
    version:String(input.version||'1'), updatedAt:input.updatedAt||new Date(0).toISOString() });
}
module.exports = { planDto, pageDto, profileDto };
