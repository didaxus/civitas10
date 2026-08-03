#!/usr/bin/env node
import fs from 'node:fs'

const CATALOG_PATH = 'contracts/authorization/civitas-permission-catalog.yaml'

// Leer el catálogo actual
const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'))

// Función para determinar identityProvisioningStatus basado en targetStatus y observedImplementation
function getIdentityProvisioningStatus(permission) {
  // Los permisos active o declared_planned deben estar provisionados
  if (permission.targetStatus === 'active' || permission.observedImplementation === 'active' || permission.observedImplementation === 'declared_planned') {
    return 'provisioned'
  }
  // Los permisos planned pueden estar provisionados si ya existen en Logto
  if (permission.targetStatus === 'planned') {
    return 'provisioned'
  }
  return 'not_provisioned'
}

// Función para determinar runtimeAvailability basado en observedImplementation
function getRuntimeAvailability(permission) {
  if (permission.observedImplementation === 'active') {
    return 'available'
  }
  return 'unavailable'
}

// Función para determinar catalogStatus
function getCatalogStatus(permission) {
  if (permission.targetStatus === 'deprecated') {
    return 'deprecated'
  }
  if (permission.targetStatus === 'active') {
    return 'active'
  }
  if (permission.targetStatus === 'planned') {
    return 'planned'
  }
  return 'defined'
}

// Función para generar presentación basada en el nombre del permiso
function generatePresentation(permission, index) {
  const parts = permission.name.split('.')
  const action = parts[parts.length - 1]
  const resource = parts[parts.length - 2] || 'resources'
  
  const label = action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ') + ' ' + resource.replace(/_/g, ' ')
  const description = `${label.toLowerCase()} for the organization.`
  
  // Determinar groupKey basado en el namespace o capabilityId
  let groupKey = permission.namespace
  if (permission.capabilityId) {
    const capabilityParts = permission.capabilityId.split('.')
    if (capabilityParts.length >= 2) {
      groupKey = capabilityParts[1]
    }
  }
  
  const groupLabel = groupKey.charAt(0).toUpperCase() + groupKey.slice(1).replace(/_/g, ' ')
  
  return {
    label,
    description,
    groupKey,
    groupLabel,
    groupOrder: Math.floor(index / 10) * 10,
    order: index % 10
  }
}

// Actualizar cada permiso con los nuevos campos
catalog.permissions = catalog.permissions.map((permission, index) => {
  const updated = { ...permission }
  
  // Agregar campos si no existen
  if (!updated.identityProvisioningStatus) {
    updated.identityProvisioningStatus = getIdentityProvisioningStatus(permission)
  }
  
  if (!updated.runtimeAvailability) {
    updated.runtimeAvailability = getRuntimeAvailability(permission)
  }
  
  if (!updated.catalogStatus) {
    updated.catalogStatus = getCatalogStatus(permission)
  }
  
  // Agregar presentación si no existe y el permiso está activo o provisionado
  if (!updated.presentation && (updated.catalogStatus === 'active' || updated.identityProvisioningStatus === 'provisioned')) {
    updated.presentation = generatePresentation(permission, index)
  }
  
  return updated
})

// Guardar el catálogo actualizado
fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + '\n')

console.log(`Updated ${catalog.permissions.length} permissions with new fields`)
console.log('Fields added: identityProvisioningStatus, runtimeAvailability, catalogStatus, presentation')
