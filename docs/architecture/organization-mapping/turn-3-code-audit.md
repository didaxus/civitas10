# Turn 3 code audit

Approved Turn 1 base: `3928de1618c280392fbb438cc336899088ed62e0`.
Approved Turn 2 head: `2b46f8b38f428de527bcfd1a9f1f9306f65406e0`.

## Reuse and conventions

- PostgreSQL repositories in this repo use small query wrappers around `pool.query`, tenant predicates, and explicit mappers; Turn 3 follows that shape.
- Existing identity-federation normalization is reused for provider-neutral source facts.
- Existing audit/outbox patterns are event-envelope based; Turn 3 records audit and outbox foundations but does not publish Turn 4 workflows.
- Existing idempotency conventions scope keys by organization; Turn 3 uses `(organization_id, idempotency_key)`.
- Existing API errors expose `{ error, code }` envelopes; Turn 3 routes use the same minimal envelope.

## Conflicts and resolutions

- Turn 2 exports a candidate engine, not persistence. Turn 3 persists traces and reviews but does not convert candidates into authorization assignments.
- Planned organization-model permissions cannot be mounted through the active-permission middleware yet. The router therefore declares lifecycle action requirements from the shared registry and leaves runtime guard activation to the authorization integration turn.
- Raw external facts may contain secrets or PII. Turn 3 stores source snapshots but response contracts use server-side redaction.

## Explicit non-goals

No final publish transaction, rollback publication, Structure projection, Data Scope assignment reconciliation, or issue #319 production UI is implemented.
