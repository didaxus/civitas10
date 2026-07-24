# P3-019 Planning first vertical slice gate evidence

P3-019 defines the automated gate and evidence artifact set for the first Planning vertical slice. The machine-readable artifact is `artifacts/planning/p3-019-gate-evidence.json`; the gate is `npm run planning:p3-019:check`.

## Required scenario coverage

The gate requires evidence rows for: two-organization allow/deny/no-leakage; authentication, audience, and tenant binding; role path; owner ceiling; tenant activation; policies; data scope; module lifecycle and health; replay/JTI; idempotency replay/conflict; stale ETag; approved mutation denial; timeout, unavailable, incompatible, circuit open, and recovery; UI degraded/fallback states; and remote bundle failure.

## Parity and hash verification

The artifact pins SHA-256 parity sets for the public OpenAPI contract, private Planning runtime schema, generated clients/inventories, backend routes/actions/services, frontend routes/actions/screens, and Planning event contracts. Any drift in those source files fails the gate until the artifact is reviewed and regenerated.

## Active-entry rule

A row may be marked `active` only when all six evidence categories pass: contracts, consumers, tests, deployment, observability, and rollback. The gate fails any `active` row missing one of those passing evidence markers.

## Canary

The canary path is contract-only dark launch, single internal tenant, two-organization canary, then progressive tenant opt-in. Abort signals include authorization denial regression, cross-tenant leakage, runtime incompatibility, a circuit that stays open after recovery probe, or any UI white-screen/fallback regression.

## Rollback without data deletion

Rollback disables tenant activation and runtime/UI bindings, preserves contracts and audit/event/idempotency ledgers, fails closed, and does not delete tenant Planning data. Re-enablement requires recovery probes and a fresh canary progression.
