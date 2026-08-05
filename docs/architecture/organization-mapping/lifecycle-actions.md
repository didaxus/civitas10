# Lifecycle actions

The machine-readable registry is `core/organization-mapping/lifecycle-action-registry.cjs`. It defines read published model, read draft, edit draft, evaluate policies, read sensitive evidence, approve mapping, publish exact version, reconcile upstream changes, inspect audit history, and create rollback draft. Every entry declares canonical permission, Owner Ceiling, Tenant Activation, ABAC behavior, runtime dependency, evidence classification, UI treatment, risk, audit, reason, and idempotency requirements.
