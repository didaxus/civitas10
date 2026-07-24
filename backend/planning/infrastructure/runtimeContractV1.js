const { createHash, randomUUID } = require('node:crypto');
const { planDto, pageDto, profileDto } = require('../application/dtos');
const { NAMED_USE_CASES, REMOTE_PROBLEM_CODES, problem } = require('../application/remotePort');
const CONTRACT_VERSION='planning-runtime/v1';
const MEDIA_TYPE='application/vnd.civitas.planning-runtime.v1+json';
const MAX_REQUEST_BYTES=32768; const MAX_RESPONSE_BYTES=65536;
const REQUIRED_HEADERS=Object.freeze(['Content-Type','Accept','X-Civitas-Contract-Version','X-Civitas-Execution-Context','X-Correlation-Id']);
const paths=Object.freeze({ createPlan:'/private/planning-runtime/v1/plans', listPlans:'/private/planning-runtime/v1/plans:list', getPlan:'/private/planning-runtime/v1/plans:get', updatePlan:'/private/planning-runtime/v1/plans:update', getProfile:'/private/planning-runtime/v1/profile:get', replaceProfile:'/private/planning-runtime/v1/profile:replace' });
function contractHash(){ return createHash('sha256').update(JSON.stringify({CONTRACT_VERSION,MEDIA_TYPE,paths,REQUIRED_HEADERS,MAX_REQUEST_BYTES,MAX_RESPONSE_BYTES})).digest('hex'); }
function toWireRequest(useCase, input, context){ const op=NAMED_USE_CASES[useCase]; const base={ schemaVersion:CONTRACT_VERSION, organizationId:context.organizationId, operation:{ moduleId:'planning', capabilityId:op.capabilityId, operationId:op.operationId, actionId:op.actionId }, requestId:randomUUID(), command:{} };
  if(useCase==='createPlan') base.command={ title:String(input.title), description:input.description||null };
  if(useCase==='listPlans') base.command={ cursor:input.cursor||null, limit:Number(input.limit||50) };
  if(useCase==='getPlan') base.command={ planId:String(input.planId) };
  if(useCase==='updatePlan') base.command={ planId:String(input.planId), title:input.title||null, description:input.description||null };
  if(useCase==='getProfile') base.command={};
  if(useCase==='replaceProfile') base.command={ planningMode:input.planningMode||'standard', preferences:{ fiscalYearStart:input.preferences?.fiscalYearStart||'01-01' } };
  return Object.freeze(base); }
function fromWireResponse(useCase, body){ if(!body || body.schemaVersion!==CONTRACT_VERSION) throw new Error('planning runtime response schema mismatch'); if(useCase==='listPlans') return pageDto(body.result); if(useCase==='getProfile'||useCase==='replaceProfile') return profileDto(body.result); return planDto(body.result); }
function normalizeProblem(status, body, correlationId){ const type=body?.code; const map={ validation:REMOTE_PROBLEM_CODES.VALIDATION, not_found:REMOTE_PROBLEM_CODES.NOT_FOUND, conflict:REMOTE_PROBLEM_CODES.CONFLICT, precondition_failed:REMOTE_PROBLEM_CODES.PRECONDITION, authorization_context:REMOTE_PROBLEM_CODES.AUTH_CONTEXT, contract_mismatch:REMOTE_PROBLEM_CODES.CONTRACT_MISMATCH, tenant_mismatch:REMOTE_PROBLEM_CODES.TENANT_MISMATCH, idempotency_conflict:REMOTE_PROBLEM_CODES.IDEMPOTENCY_CONFLICT };
  const code=map[type] || (status===504?REMOTE_PROBLEM_CODES.TIMEOUT:status===503||status===429?REMOTE_PROBLEM_CODES.UNAVAILABLE:REMOTE_PROBLEM_CODES.BAD_GATEWAY);
  const category=code.split('.').pop(); return problem(code, category, { correlationId, retryable:[429,502,503,504].includes(status), fieldViolations:Array.isArray(body?.fieldViolations)?body.fieldViolations.map(v=>({ field:String(v.field).slice(0,80), code:String(v.code).slice(0,80) })):[], currentVersion:body?.currentVersion }); }
module.exports={ CONTRACT_VERSION, MEDIA_TYPE, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES, REQUIRED_HEADERS, paths, contractHash, toWireRequest, fromWireResponse, normalizeProblem };
