# P3-016 Planning application services audit and blocker

## Audit result

The mandatory inventory was performed from `main` at
`7de22afe1cf0e0f60b72fb5d2c9890e3a451e786`. No open pull request matching P3-014,
P3-015, P3-016, or Planning was returned by the GitHub pull-request API on 2026-07-29.
The machine-readable classification is in
`artifacts/planning/p3-016-implementation-inventory.json`.

P3-014 contracts, the P3-008 execution-context implementation, P3-010 integration
primitives, seven stable Planning ports, six named service functions, delivery adapters,
and fake service tests already exist and must be reused. They were not duplicated.

## Blocking dependency

P3-015 has no executable Planning aggregate, immutable plan-version domain, tenant-bound
PostgreSQL repositories, migration, rollback, or real two-tenant persistence tests in this
repository. Consequently P3-016 cannot truthfully establish persistence-backed
idempotency, compare-and-swap, immutable approved history, or atomic state + audit +
outbox behavior.

The existing services are contract-test scaffolding over stable ports. Their in-memory
fake proves call ordering only; it is not evidence for PostgreSQL uniqueness,
transactions, rollback, concurrency, or tenant constraints. The existing emission of
`planning.plan.updated.v1` is also a contract gap because P3-014 registers only
`planning.plan.created.v1` and `planning.profile.updated.v1`. No new event name is
invented here.

Following the issue rule for a missing executable dependency, this change records the
blocker and reuses the existing stable ports. It does not create a parallel aggregate,
repository, outbox, audit writer, authorization evaluator, idempotency store, or Ágora
runtime inside Civitas. Planning remains `planned`.

## Unblock and rollback

Implement P3-015 in the registered Ágora runtime root first, including reversible
migrations and PostgreSQL tests. Then bind these application-service ports to that same
transaction and add the missing versioned update event contract if update emission is
required. Rollback of a later P3-016 deployment must disable the private consumer while
preserving approved versions, audit/outbox history, idempotency records, version columns,
and tenant constraints.
