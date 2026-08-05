# Organization mapping architecture (#318 Turn 1)

This package is the normative consolidation for organization-model mapping contracts. Current authorization contracts remain authoritative for permissions, role potential, Owner Ceiling, Tenant Activation, ABAC assignments, and runtime decisions; this package only freezes mapping vocabulary and lifecycle action contracts.

GitHub issue #318 comments could not be read in this environment because `gh` has no token; this is recorded as a human-review risk. The repository inventories and current implementation were audited locally.

## Boundary summary

A directory mapping is not an access grant. OIDC, SAML, LDAP, and SCIM facts may provide evidence, but they never become roles, permissions, PBAC activations, or ABAC assignments. Organization-model configuration is separate from `authorization_scope_assignments`, whose exactly-one-target invariant remains unchanged.

## #218 supersession

Issue #218 remains authoritative for tenant-owned canonical data-scope dimensions and immutable published value behavior. It is superseded where it removed `academic.grade_level` and where it allowed `academic.period` to represent academic year, concrete term, and term type simultaneously.

## Implementation dependency

#318 supplies backend-owned contracts and migrations. #319 UI must consume these contracts and backend decisions; it must not create a parallel lifecycle-action registry or treat mappings as grants.
