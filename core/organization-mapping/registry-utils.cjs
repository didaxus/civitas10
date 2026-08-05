"use strict";
const crypto=require("node:crypto");
function canonicalize(v){ if(Array.isArray(v)) return v.map(canonicalize); if(v&&typeof v==="object") return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonicalize(v[k])])); return v; }
function hashRegistry(version,entries){return crypto.createHash("sha256").update(JSON.stringify(canonicalize({version,entries}))).digest("hex");}
function assertUnique(entries,key="key"){const seen=new Set(); for(const e of entries){const id=e[key]||e.id; if(seen.has(id)) throw new Error(`registry_duplicate:${id}`); seen.add(id);} return true;}
function defineRegistry({version,entries,key="key"}){assertUnique(entries,key); const frozen=Object.freeze(entries.map(e=>Object.freeze({...e}))); const byKey=Object.freeze(Object.fromEntries(frozen.map(e=>[e[key]||e.id,e]))); const registryHash=hashRegistry(version,frozen); function get(id){return byKey[id]||null;} function assert(id){const value=get(id); if(!value||value.status!=="active") throw new Error(`registry_entry_unknown_or_inactive:${id}`); return value;} return Object.freeze({version,entries:frozen,byKey,hash:registryHash,get,assert,assertUnique:()=>assertUnique(frozen,key),safeContract:()=>Object.freeze({version,hash:registryHash,entries:frozen})});}
module.exports={canonicalize,hashRegistry,assertUnique,defineRegistry};
