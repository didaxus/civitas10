"use strict";
const crypto = require("node:crypto");
const { permissionsByName, rolePermissionAssignments } = require("../../core/authz");
const { createEntitlementService } = require("../authorization/entitlements/entitlementService");

function hashSubject(value) { return value ? `sub_${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12)}` : null; }
function roleId(role = {}) { return role.id || role.organizationRoleId || role.roleId || null; }
function roleName(role = {}) { return role.name || role.nameCache || role.key || null; }
function canonicalRoleKey(name = "") { const raw = String(name || "").trim(); if (raw.startsWith("organization_") || raw === "owner_global") return raw; return `organization_${raw.replace(/-org$/i, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase()}`; }
function displayName(name = "") { return String(name || "").replace(/-org$/i, "").replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }

/**
 * Returns all organization-surface permissions that should appear in the UI.
 * Filter criteria per civitas RBAC two-level model:
 * - surface === "organization"
 * - identityProvisioningStatus === "provisioned" (or legacy: status === "active" || targetStatus !== "deprecated")
 * - has presentation metadata
 * - catalogStatus !== "deprecated"
 */
function organizationPermissions() {
  return Object.values(permissionsByName).filter((permission) => {
    if (permission.surface !== "organization") return false;
    if (!permission.presentation) return false;
    
    // Support new identityProvisioningStatus field
    const isProvisioned = permission.identityProvisioningStatus === "provisioned";
    // Legacy support: active permissions are provisioned by default
    const isActive = permission.status === "active" || permission.targetStatus === "active";
    // Exclude deprecated
    const isDeprecated = permission.catalogStatus === "deprecated" || permission.targetStatus === "deprecated";
    
    if (isDeprecated) return false;
    return isProvisioned || isActive;
  }).sort((a, b) => 
    (a.presentation.groupOrder || 0) - (b.presentation.groupOrder || 0) || 
    (a.presentation.order || 0) - (b.presentation.order || 0)
  );
}
function createGovernanceRolesService({ entitlementRepository } = {}) {
  if (!entitlementRepository || entitlementRepository.kind !== "postgres") throw new Error("postgres_entitlement_repository_required");
  async function listRoleView({ roles, organizationId }) { const limits = await entitlementRepository.listLimits({ organizationId }); return roles.flatMap((role) => { const id=roleId(role); const key=canonicalRoleKey(roleName(role)); if(!id || !key.startsWith("organization_")) return []; const potential=rolePermissionAssignments[key] || []; return [{ id, canonicalKey:key, displayName: displayName(roleName(role)), assignedMemberCount: 0, permissionCount: potential.length, enabledPermissionCount: limits.filter((limit)=>limit.logtoRoleId===id&&limit.allowed).length }]; }); }
  async function buildPermissionRows({ organizationId, roles, surface }) { 
    const [limits, activations, policyVersion] = await Promise.all([
      entitlementRepository.listLimits({organizationId}), 
      entitlementRepository.listActivations({organizationId}), 
      entitlementRepository.getPolicyVersion(organizationId)
    ]); 
    const limitKey=(role,permission)=>limits.find((row)=>row.logtoRoleId===role&&row.permissionKey===permission); 
    const activationKey=(role,permission)=>activations.find((row)=>row.logtoRoleId===role&&row.permissionKey===permission); 
    
    return roles.flatMap((role)=>{ 
      const id=roleId(role); 
      const key=canonicalRoleKey(roleName(role)); 
      if(!id || !key.startsWith("organization_")) return []; 
      
      const potential=new Set(rolePermissionAssignments[key] || []); 
      
      // Use organizationPermissions() instead of operationalPermissions() to include all domains
      return organizationPermissions()
        .filter((permission) => potential.has(permission.name))
        .map((permission)=>{ 
          const limit=limitKey(id,permission.name); 
          const activation=activationKey(id,permission.name); 
          const roleAllows=potential.has(permission.name); 
          const ownerAllowed=limit?.allowed===true; 
          const locked=limit?.locked===true; 
          const canChange=surface==="owner" ? roleAllows : roleAllows&&ownerAllowed&&!locked; 
          const controlState=canChange?"editable":!roleAllows?"blocked_by_role":locked?"locked":"blocked_by_ceiling"; 
          
          return { 
            permissionId:permission.name, 
            roleId:id, 
            ...permission.presentation, 
            enabled:surface==="owner"?ownerAllowed:activation?.enabled===true, 
            canChange, 
            controlState, 
            reasonCode:canChange?null:controlState, 
            ownerAllowed, 
            tenantEnabled:activation?.enabled===true, 
            effective:ownerAllowed&&activation?.enabled===true, 
            policyVersion:String(policyVersion),
            // Add new state fields for two-level RBAC model
            rolePotential: roleAllows,
            identityProvisioned: permission.identityProvisioningStatus === "provisioned" || permission.status === "active",
            runtimeAvailable: permission.runtimeAvailability === "available" || permission.observedImplementation === "active",
            organizationAvailable: true // Default, can be refined by module availability resolver
          }; 
        }); 
    }); 
  }
  async function buildSlice({ organizationId, roles=[], members=[], memberRolesByUserId=new Map(), surface="owner" }) { return { contractVersion:"2026-08-civitas10-permission-policy-v1", policyVersion:String(await entitlementRepository.getPolicyVersion(organizationId)), roles:await listRoleView({roles,organizationId}), members:members.map((user)=>({id:user.id||user.userId,display:hashSubject(user.id||user.userId),roleIds:(memberRolesByUserId.get(user.id||user.userId)||[]).map(roleId).filter(Boolean)})), permissionMatrix:await buildPermissionRows({organizationId,roles,surface}) }; }
  const mutations=(roleIdToName)=>createEntitlementService({repository:entitlementRepository,roleIdToName});
  return { buildRolesGovernanceSlice:buildSlice, updateOwnerCeilings:(input)=>mutations(input.roleIdToName).upsertOwnerLimits(input), updateTenantActivations:(input)=>mutations(input.roleIdToName).upsertTenantActivations(input) };
}
function roleMapFromRoles(roles=[]) { return Object.fromEntries(roles.map((role)=>[roleId(role),canonicalRoleKey(roleName(role))]).filter(([id])=>id)); }
module.exports={createGovernanceRolesService,roleMapFromRoles,canonicalRoleKey};
