# Governance persistence ports

The governance read models consume explicit ports; production does not own fallback state.

| Port | Consumer | Existing PostgreSQL model |
|---|---|---|
| entitlements | roles | `org_role_entitlement_limits`, `org_role_permission_activations`, `authorization_policy_versions` |
| taxonomy | structure | `taxonomy_dimension_definitions`, `organization_dimension_values`, `organization_taxonomy_state` |
| organization units | structure | `organization_units`, `organization_unit_memberships`, `organization_capability_group_refs`, `organization_structure_versions` |
| Data Scope | structure | `authorization_scope_assignments`, `authorization_policy_versions` |
| aliases/navigation preferences | operations | JSON columns on the existing `authorization_policy_versions` aggregate |
| audit | all | `audit_logs` |
| outbox | all | `authorization_outbox_events` |

`createPostgresGovernanceAdapters` exposes one transaction boundary backed by a checked-out PostgreSQL client. Async-local propagation makes state, CAS version, audit, and outbox writes use that same transaction and therefore commit or roll back together.
