# Tri-state mapping engine

The reusable engine maps normalized external facts to organization-model candidates only. It never writes roles, permissions, memberships, Owner Ceiling, Tenant Activation, tokens, or `authorization_scope_assignments`.

Outcomes are `matched`, `not_matched`, `ambiguous`, and `incompatible`. Incomplete evidence is ambiguous. Cross-tenant evidence, unknown selectors, unknown dimensions, unsupported operators, and grant-shaped targets are incompatible.

Precedence order is tenant authority, explicit precedence, selector specificity, then deterministic rule id. A tie with different targets is ambiguous.
