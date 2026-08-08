# Authority, refinements, and precedence

Authority is selected only from the versioned authority registry. Effective evaluation orders candidates by registered authority and deterministic specificity; timestamps, database row order, actor privilege, and lexical rule IDs are not tie breakers.

A matching Exclude at an authority equal to or higher than every matching candidate is a global veto and returns `mapping_higher_authority_exclusion`. Specificity cannot defeat that veto. Tied incompatible outcomes remain `mapping_outcome_conflict` unless the selected child declares an exact parent policy ID/version, one of `inherits`, `extends`, `narrows`, or `resolves_conflict`, and a non-empty reason. Policies and reusable selector sets are immutable exact versions; `latest`, `current`, and wildcard references are rejected.

Canonical permissions come from the permission catalog. Role potential is generated separately and never substitutes for Owner Ceiling, Tenant Activation, ABAC, current authorization snapshots, or the backend decision. Direct role-name authorization remains forbidden.
