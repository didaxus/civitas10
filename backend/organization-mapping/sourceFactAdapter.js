"use strict";
const crypto=require("node:crypto");
const { normalizeExternalIdentity } = require("../identity-federation/claimNormalizer");
const { FIELD_CLASSIFICATION } = require("./evidenceRedaction");
const FORBIDDEN=new Set(["token","accessToken","idToken","assertion","password","authorization","connectorSecret","clientSecret"]);
function valueHash(value){return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");}
function evidenceRecords(input){const profile=input.profile||input.claims||{};return Object.freeze(Object.entries(profile).filter(([key])=>!FORBIDDEN.has(key)).map(([key,value])=>Object.freeze({evidenceRef:`ev_${valueHash([key,value]).slice(0,24)}`,attributeKey:key,classification:FIELD_CLASSIFICATION[key]||"connector_diagnostics",valueHash:valueHash(value),cardinality:Array.isArray(value)?"multi":"single"})).sort((a,b)=>a.evidenceRef.localeCompare(b.evidenceRef)));}
function normalizeSourceFacts(input = {}) {
  const normalized = normalizeExternalIdentity(input);
  const capturedAt=input.capturedAt||new Date().toISOString();
  return Object.freeze({ ...normalized, sourceFamily:String(input.provider||normalized.provider||"unknown").toLowerCase(),sourceConnectionId:input.sourceConnectionId||null,sourceSnapshotVersion:Number(input.sourceSnapshotVersion||1),capturedAt,evidence:evidenceRecords(input) });
}
module.exports = { normalizeSourceFacts, evidenceRecords };
