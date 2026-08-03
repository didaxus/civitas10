# Production handoff boundary

## Contract and ownership

`civitas-production-handoff/v1` is the provider-neutral message sent after a plan version is approved. It contains only organization, immutable plan identifier/version, SHA-256 content digest, approval provenance, and correlation/operation identifiers. It never transfers ownership of Civitas tasks, source assets, credentials, working files, or provider internals. Civitas remains the system of record for the approved plan; Plasma is one replaceable adapter behind `ProductionHandoffPort`.

The application service compares both the requested version and digest with the approved-version repository before delivery. A provider receipt is accepted only when its organization, handoff identifier, and digest match. The stable `handoffId` is the delivery idempotency key: replaying it returns the existing operation rather than resubmitting.

## Operations and canonical events

Each attempt is correlated through the handoff's `operationId` and `correlationId`. The operation ledger records accepted/running and terminal outcomes. The canonical event stream records:

* `production.handoff.requested`;
* `production.handoff.received`;
* `production.handoff.rejected`;
* `production.handoff.timed_out`; and
* `production.handoff.reconciled`.

Events use an allowlisted projection of the wire contract and receipt. They must not contain task descriptions, source assets, content bodies, credentials, provider request dumps, or error stacks.

## Timeout and reconciliation

A timeout means delivery is **unknown**, not that Plasma failed to apply it. Civitas aborts the local wait, records the timeout, and does not blindly retry with a new handoff identifier. Reconciliation queries the provider using the original organization and `handoffId`; only a matching receipt can recover the operation. A mismatched tenant, identifier, or digest is rejected for manual investigation.

## Cancellation and rollback

Cancellation is best effort and affects only pending provider work. It never deletes a receipt or edits the approved plan version. A receipt that races with cancellation wins and is reconciled normally.

Rollback is a new operational instruction to activate an explicitly identified earlier, already approved release. It does not reverse history, mutate either approved version, reuse a content hash for different content, or transfer ownership of internal assets. Cancellation and rollback retain the original correlation chain and receive distinct operation identifiers; adapter failure leaves the currently active production release unchanged.
