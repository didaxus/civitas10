# Turn 2 implementation audit

Base commit: `3928de1618c280392fbb438cc336899088ed62e0`.

## Reused registries

- Permission catalog and generated role model remain the authorization registry of record.
- Turn 1 lifecycle registry remains authoritative for lifecycle action metadata.
- Data-scope dimension registry remains the canonical vocabulary source.
- Policy runtime convention remains allow/deny/not-applicable for authorization; mapping uses a separate tri-state candidate outcome because mapping is not authorization.

## Duplicated registries avoided

No frontend selector/action registry was added. Selector sets live in `core/organization-mapping/selector-registry.cjs` for backend/shared consumption.

## Conflicts and resolutions

- GitHub issue comments were unavailable because `gh` has no token; this remains a human-review risk.
- Existing role mapping code validates canonical role names for downstream connector mapping. It was not reused for organization-model candidate mapping because Turn 2 forbids mapping results from assigning roles or permissions.
- Boolean match/no-match is unsafe for incomplete, stale, cross-tenant, or conflicting evidence; the new engine returns `matched`, `not_matched`, `ambiguous`, or `incompatible`.

## Existing conventions

- Hashing uses deterministic JSON over frozen registries.
- Reason codes are immutable exported objects.
- Backend remains authorization authority; unknown selectors/dimensions and unsafe grant-shaped outputs fail closed as incompatible.
