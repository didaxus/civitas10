// backend/middleware/requireOrg.js
// ÚNICA pieza autorizada para poblar req.org
// Siempre va después de requireOrganizationAccess/requireAuth y antes de requireSeats

'use strict'

const { queryPostgres } = require('../lib/db')

async function requireOrg(req, res, next) {
  const requestedOrgId =
    req.params?.org_id ??
    req.params?.id ??
    req.params?.organizationId ??
    null

  const tokenOrgId = req.user?.organizationId ?? null
  const hostOrgId = req.tenantContext?.organizationId ?? null
  const sessionOrgId = req.session?.organizationId ?? null
  const authoritative = [hostOrgId, sessionOrgId, tokenOrgId].filter(Boolean)
  const presented = [...authoritative, requestedOrgId].filter(Boolean)
  if (presented.length && presented.some((organizationId) => organizationId !== presented[0])) {
    return res.status(403).json({ error: 'organization_context_mismatch' })
  }
  const canonicalOrgId = hostOrgId || sessionOrgId || tokenOrgId

  if (!canonicalOrgId) {
    return res.status(400).json({
      error: 'organization_context_required',
      detail: 'No se encontró un contexto organizacional autenticado',
    })
  }

  let org
  try {
    const result = await queryPostgres(
      `SELECT id,
              logto_organization_id,
              operational_status AS status,
              metadata->>'plan' AS plan,
              COALESCE((metadata->>'seats_total')::int, 0) AS seats_total,
              COALESCE((metadata->>'seats_used')::int, 0) AS seats_used
       FROM operational_tenants
       WHERE id = $1 OR logto_organization_id = $1
       LIMIT 1`,
      [canonicalOrgId]
    )
    org = result.rows[0]
  } catch (_err) {
    return res.status(500).json({ error: 'organization_lookup_failed' })
  }

  if (!org) {
    return res.status(404).json({ error: 'organization_not_found' })
  }

  if (tokenOrgId && org.logto_organization_id !== tokenOrgId && org.id !== tokenOrgId) {
    return res.status(403).json({
      error: 'organization_context_mismatch',
      detail: 'La organización resuelta no coincide con la del token',
    })
  }

  if (org.status === 'suspended') {
    return res.status(403).json({
      error: 'organization_suspended',
      action: 'Contactar al owner para reactivar',
    })
  }

  if (org.status === 'cancelled') {
    return res.status(403).json({
      error: 'organization_cancelled',
      action: 'Contactar soporte',
    })
  }

  const seatsTotal = org.seats_total ?? 0
  const seatsUsed = org.seats_used ?? 0

  req.org = {
    id: org.id,
    logto_organization_id: org.logto_organization_id,
    status: org.status,
    plan: org.plan,
    seats_total: seatsTotal,
    seats_used: seatsUsed,
    seats_available: Math.max(seatsTotal - seatsUsed, 0),
  }

  return next()
}

module.exports = { requireOrg }
