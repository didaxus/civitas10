# Phase 3 production readiness and drills

**Current decision: `NO_GO`.** Passing local synthetic checks is necessary but never sufficient. Phase 3 may only be marked complete after every drill below has passed in staging or production, evidence is attached, and every residual risk is accepted by its owner.

## Telemetry and incident routing

All metrics, JSON logs and spans carry `correlationId`, W3C-shaped `traceId`/`spanId`, `operationId`, `tenantId`, `moduleId`, `contractId`, and `contractVersion`. Tenant IDs are identifiers, never names. Payloads, tokens, cookies, credentials and direct PII are forbidden and recursively redacted. The manifest defines three dashboards, eight SLIs/SLOs, alert queries, team ownership, primary on-call and escalation. `operations/phase3/alerts.prometheus.yml` is the deployable alert rule baseline.

## Evidence envelope

Every drill record must include: immutable commit SHA, deployed version, environment, UTC timestamp, accountable owner, input/output hashes, result, measured RPO/RTO where applicable, and links to redacted logs/traces/dashboard snapshots. Never edit a passed record for a different deployment; create a new record. A synthetic record has `scope=synthetic-contract-drill` and cannot close Phase 3.

## Drill procedure and pass criteria

1. **Circuit recovery:** inject upstream failures until open; prove calls are blocked, half-open probes are bounded, and healthy traffic closes it without a retry storm. Pass: recovery within 10 minutes and no cross-tenant data.
2. **DLQ/reconciliation:** poison one event, observe the page, repair it, replay with the canonical event ID twice, and reconcile inbox/outbox/operation ledgers. Pass: exactly one effect, empty owned DLQ, zero unexplained drift.
3. **Tenant-safe backup/restore:** record the last durable write, back up tenant A, restore to an isolated target, verify tenant and contract hashes, and assert tenant B is absent. Record measured RPO from last durable write and RTO from declaration to validated service. Targets: RPO <= 5 minutes, RTO <= 60 minutes.
4. **Key rotation:** introduce the new service key, verify dual-key overlap, migrate callers, revoke the old key, and prove it fails. Pass: uninterrupted SLO and no old-key acceptance after revocation.
5. **UI/runtime rollback:** canary an incompatible runtime and integrity-failing remote UI; verify safe degradation, pin the last compatible signed version, then rollback. Pass: no white screen/authority bypass and recovery within 15 minutes.
6. **Decommissioning:** disable activation, prove zero consumers/queues/operations, export or delete tenant data per retention, revoke identities and keys, then remove binding. Pass: zero consumers and no orphan secrets/data.
7. **Secret/PII scan:** scan structured logs and traces using deterministic canary secrets, sensitive-key rules, entropy detection, and approved PII classifiers. Pass: zero raw secrets or direct PII; any finding is an incident and invalidates the run.

Run `npm run phase3:production-readiness:drill`. Then replace the synthetic exercise with environment-specific execution, preserving its evidence envelope. During an incident, page the manifest owner; unresolved pages escalate to the incident commander.

## Residual-risk gate

The register lives in `operations/phase3/production-readiness.json`. `acceptance=pending` is a hard closure blocker. Acceptance requires owner, expiry/review date, compensating control evidence, and a tracked remediation. The release decision must remain `NO_GO_UNTIL_ALL_DRILLS_PASS` until all real-environment drills pass and no risk remains pending.
