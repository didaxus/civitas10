# Organization Identity Federation PR Stack

This stack decomposes issue #154 into reviewable pull requests. The first PR is based on the PR #144 modular architecture branch while #144 is open. After #144 merges, each later PR must be rebased onto the updated `main` before opening or updating its pull request.

## Required order

1. `discovery-conformance-ingress` — read-only discovery, conformance probes, provider ingress boundaries, and static gates. No provider writes.
2. `persistence-credential-foundations` — tenant-scoped persistence, migration contracts, credential reference foundations, and redaction. No plaintext secrets.
3. `users-lifecycle` — user observation, normalized identity lifecycle, join/suspend/deprovision candidates, and active-only materialization boundaries.
4. `groups-lifecycle` — external group observation lifecycle, immutable correlation, absence handling, and group history.
5. `group-to-role-mapping` — governed external-group-to-canonical-role mapping proposals, owner ceiling checks, approvals, and active-only outputs.
6. `seat-capacity-integration` — seat allocation, capacity checks, entitlement integration, and fail-closed no-seat behavior.
7. `reconciliation-operation-ledger-integration` — dry-run/apply reconciliation, operation resources, retryable ledger entries, audit links, and idempotency.
8. `governance-ui` — read/preview governance surfaces for connection health, mappings, reconciliation, deprovision history, and warnings. The browser never receives Logto Management API credentials.
9. `production-readiness-entra-security-retry-two-tenant-history-observability-runbooks` — Entra compatibility, group-overage handling, security hardening, retry/backoff, two-tenant isolation tests, deprovision history, observability, and runbook tests.

## Dependency and rebasing rules

- PR 1 may target the PR #144 branch only while #144 is open.
- PRs 2-9 must target the updated `main` after #144 merges, and each PR must be rebased onto `main` plus the previously merged stack PRs.
- Do not skip a stack layer by mixing user lifecycle, groups lifecycle, mapping, capacity, reconciliation, UI, or production-readiness work into an earlier PR.
- Reuse previous test results and reviewer interactions when fixing later layers so failures are not reintroduced or re-tested unnecessarily.

## Issue boundaries

- Issue #154 is the parent Organization Identity Federation implementation track.
- Issue #155 is only the SCIM child of #154. It is not authentication, it is not a Logto fork, and it must not be used to bypass #154 governance, mapping, seat, reconciliation, or audit rules.
- Logto remains the authentication and canonical organization-membership authority. Civitas implements governed federation orchestration around Logto; it does not fork Logto authentication.
