# Decision: Planning `ui-access` is not a public API

Status: accepted

The Civitas OpenAPI does not approve a Planning `ui-access` operation. Consequently,
the frontend must not call `/planning/ui-access`, and no route, operation ID, action ID,
permission, policy, or speculative response schema is introduced for it.

Planning presentation is a fail-closed projection of the host's canonical
`AuthorizationContext` and the already validated UI contribution. Missing permission
is shown as denied; missing capability/data scope is shown as unavailable; an
incompatible contribution is not mounted. A context belonging to a different
organization is treated as loading until the provider supplies the selected
organization's context, preventing cross-organization display leakage.

This projection is not an authorization grant. Every Planning backend operation keeps
its mandatory server-side availability and authorization evaluation immediately before
execution. Adding a public access-decision endpoint later requires a separately
approved OpenAPI operation and cannot be inferred from this UI projection.
