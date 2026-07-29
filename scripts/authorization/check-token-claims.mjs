#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const schemaPath = join(repositoryRoot, 'contracts/authorization/token-claims.schema.json')
const fixturesRoot = join(repositoryRoot, 'contracts/authorization/fixtures/token-claims')
const architecturePath = join(repositoryRoot, 'docs/architecture/phase-3/11-CIVITAS-TOKEN-PRINCIPAL-AND-ROLE-PATHS-V2.md')
const customClaimPrefix = 'https://civitas.didaxus.com/claims/'
const expectedCustomClaims = [
  `${customClaimPrefix}organization_membership_id`,
  `${customClaimPrefix}organization_role_ids`,
  `${customClaimPrefix}authz_contract_version`,
]

const schema = JSON.parse(readFileSync(schemaPath, 'utf8'))
const architecture = readFileSync(architecturePath, 'utf8')
const documentedCustomClaims = [...architecture.matchAll(/^https:\/\/civitas\.didaxus\.com\/claims\/[a-z_]+$/gm)].map(([claim]) => claim)

assert.match(architecture, /target organization token contains exactly these Civitas custom claims:/)
assert.deepEqual(documentedCustomClaims, expectedCustomClaims, 'architecture must define exactly the three accepted custom claims')
assert.equal(schema.additionalProperties, false, 'token schema must reject every claim it does not enumerate')
assert.deepEqual(
  Object.keys(schema.properties).filter((claim) => claim.startsWith(customClaimPrefix)),
  expectedCustomClaims,
  'schema custom claims must match the normative exactly-three list',
)

function validate(node, value, path = '$') {
  const errors = []
  if (node.oneOf) {
    const results = node.oneOf.map((candidate) => validate(candidate, value, path))
    if (results.filter((result) => result.length === 0).length !== 1) errors.push(`${path} must match exactly one alternative`)
    return errors
  }
  const actualType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (node.type && (node.type === 'integer' ? actualType !== 'number' || !Number.isInteger(value) : actualType !== node.type)) {
    return [`${path} must be ${node.type}`]
  }
  if (node.const !== undefined && value !== node.const) errors.push(`${path} must equal ${JSON.stringify(node.const)}`)
  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${path} is too short`)
    if (node.format === 'uri') {
      try { new URL(value) } catch { errors.push(`${path} must be a URI`) }
    }
  }
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${path} has too few items`)
    if (node.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) errors.push(`${path} contains duplicate items`)
    value.forEach((item, index) => errors.push(...validate(node.items, item, `${path}[${index}]`)))
  }
  if (actualType === 'object') {
    for (const required of node.required || []) if (!Object.hasOwn(value, required)) errors.push(`${path}.${required} is required`)
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(node.properties, key)) errors.push(`${path}.${key} is not allowed`)
    }
    for (const [key, child] of Object.entries(node.properties || {})) {
      if (Object.hasOwn(value, key)) errors.push(...validate(child, value[key], `${path}.${key}`))
    }
  }
  return errors
}

function fixtureFiles(kind) {
  const directory = join(fixturesRoot, kind)
  return readdirSync(directory).filter((name) => name.endsWith('.json')).sort().map((name) => join(directory, name))
}

const validFixtures = fixtureFiles('valid')
const invalidFixtures = fixtureFiles('invalid')
assert.ok(validFixtures.length > 0, 'at least one positive fixture is required')
assert.deepEqual(invalidFixtures.map((file) => file.split('/').at(-1)), [
  'disallowed-standard-claim.json',
  'duplicate-roles.json',
  'empty-audience.json',
  'empty-organization.json',
  'empty-role.json',
  'empty-subject.json',
  'extra-custom-claim.json',
  'missing-membership.json',
])
for (const file of validFixtures) assert.deepEqual(validate(schema, JSON.parse(readFileSync(file))), [], `${file} must be accepted`)
for (const file of invalidFixtures) assert.notDeepEqual(validate(schema, JSON.parse(readFileSync(file))), [], `${file} must be rejected`)

console.log(`token claims contract valid: ${validFixtures.length} positive and ${invalidFixtures.length} negative fixtures`)
