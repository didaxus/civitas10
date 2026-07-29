# Planning P3-019 E2E, canary, promotion, and rollback

All Planning operations, routes, actions, and screens remain `planned` during setup and execution. A passing test does not expose a route. Promotion is a separate, per-operation change and requires its own complete evidence row (contracts, consumers, tests, deployment, observability, and rollback).

## Reproducible PostgreSQL environment

```sh
docker compose -f docker-compose.planning-e2e.yml up -d --wait
PLANNING_E2E_DATABASE_URL=postgres://civitas:civitas-e2e-only@localhost:55432/civitas_planning_e2e npm run planning:p3-019:e2e
npm run planning:p3-019:check
```

The runner refuses an in-memory fallback. It uses two organizations and records authn, audience, membership, role path, ceiling, activation, PBAC/data scope, replay, idempotency, stale ETag, approved mutation, availability, compatibility, timeout, circuit-open/recovery, canary, correlation, and non-destructive rollback evidence.

## Correlation and evidence

One `correlationId` and one `decisionId` join the gateway, Planning audit, operation, and outbox rows. The generated `artifacts/planning/e2e/evidence-bundle.json` binds the result to the Git commit, immutable image identifier supplied by CI, environment, organizations, and start/end timestamps. CI must archive the file rather than commit a self-referential bundle.

## Canary and rollback

Run the two-organization canary while every surface is still planned. Roll back by disabling activation and runtime/UI bindings. Never truncate or drop Planning, audit, operation, idempotency, inbox, or outbox data. Verify preservation before recovery.

Only after every gate passes, promote one complete operation at a time (`create`, `list`, `get`, `update`, `getProfile`, `replaceProfile`). Re-run the entire suite between promotions; never promote a partial operation or bulk-change all statuses.
