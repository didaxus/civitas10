# Authorization CI and PostgreSQL alignment

## Scope

This change aligns the shared authorization workflow without modifying Data Scope v2 or Logto claim contracts.

## Corrections

- Uses `scripts/ci/install-node-dependencies.sh` in every authorization job that executes backend code.
- Separates Module Control Plane, Module Availability, and Integration Events PostgreSQL checks into independent jobs.
- Runs Integration Events migrations once per test process and truncates operational rows between scenarios.
- Preserves lease ownership in publish, retry, inbox, and dead-letter assertions.
- Scopes operation idempotency to `(logto_organization_id, idempotency_key)`.

## Failure classification

- Missing `jose`: CI bootstrap failure.
- `42P10` on operation creation: repository/index contract mismatch.
- Missing Integration Events tables after the first test: test isolation failure caused by dropping tables while retaining `schema_migrations`.

## Explicit non-goals

- No Data Scope v2 projection or template changes.
- No Logto custom-claim changes.
- No closure of issues #217 or #218.
