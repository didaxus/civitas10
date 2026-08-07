# CIVITAS — Organization Branding identity-provider projection

**Código:** BRAND-00A  
**Estado:** enmienda normativa de rebase  
**Aplica a:** PR #246 / Organization Branding contract  
**Foundation:** #342, #346  

## 1. Decisión preservada

Civitas remains the canonical authority for organization branding.

The existing URL-first model, OriginRequest lifecycle, validation runs, immutable publications, rollback semantics, runtime health and organization/Owner governance remain unchanged.

This amendment adds only the provider-neutral projection boundary required for login surfaces owned by the active Platform Identity Provider.

## 2. Canonical authority

```text
Civitas
- BrandDraft
- AssetReference
- BrandPublication
- publication lifecycle
- origin verification
- runtime health
- organization/Owner authorization

Platform Identity Provider
- renders authentication surfaces it owns
- may support organization branding projection as a capability

Active provider today
- Logto
```

The Identity Provider is never the source of truth for Civitas branding state.

## 3. Projection model

When the active provider supports organization-login branding, the flow is:

```text
BrandPublication active
→ branding projection operation
→ IdentityProviderAdapter branding capability
→ active provider
→ provider-side rendered login branding
```

The provider receives an approved projection of the active publication. It does not own draft editing, validation, approval, rollback or canonical asset references.

## 4. Capability contract

Branding integration must be capability-driven, conceptually:

```text
getCapabilities()
→ organizationBranding: supported | unsupported | partial

configureOrganizationBranding(...)
```

Exact method naming belongs to #346. Branding domain code must not introduce `if provider === "logto"` branches outside the provider adapter/compatibility boundary.

## 5. Unsupported provider behavior

If the active provider does not support login branding:

- Civitas publication remains valid and active;
- Civitas workspace/topbar/favicon behavior is unaffected;
- provider login falls back to approved platform branding;
- the UI exposes the provider projection as unsupported/degraded, not as publication failure;
- no draft or publication is rolled back solely because the provider lacks the capability.

## 6. Failure isolation

Provider projection failure is distinct from branding publication failure.

```text
BrandPublication: active
ProviderProjection: pending | applied | degraded | failed | unsupported
```

A transient provider outage must not mutate or supersede the canonical publication.

Retry uses tenant-bound, idempotent operation semantics and preserves publication version/hash and provider binding references.

## 7. Multi-tenant invariants

- a branding projection is bound to one canonical `organizationId`;
- provider organization binding must match that organization;
- tenant A publication can never be projected to tenant B provider organization;
- provider IDs are external binding references, never branding domain identifiers;
- switching active provider requires a new projection, not migration of branding authority.

## 8. Security and evidence

Provider credentials/secrets never enter Branding APIs or frontend payloads. Projection diagnostics expose only classified/redacted evidence and correlation IDs.

External image validation and SSRF protections remain owned by Civitas and are not delegated to the provider.

## 9. Relationship with Tenant Resolution

Tenant Resolution decides the organization before authentication. If provider login branding is used, the branding projection must correspond to the same canonical organization resolved by the tenant flow; provider-side organization identifiers cannot select or override the tenant.

## 10. Definition of Done

The branding contract remains provider-neutral when:

- Civitas can publish branding without an Identity Provider branding capability;
- Logto can receive the active publication through the adapter when supported;
- a fake provider with no branding support leaves Civitas publication valid;
- provider projection failure is observable but does not corrupt canonical publication state;
- no Logto-specific identifier becomes a Branding primary key or authority.

## 11. Decisión final

> Civitas owns organization branding. The Platform Identity Provider may render an approved projection on provider-owned login surfaces when a declared capability exists. Logto is the active implementation today, but replacing it does not change the Branding domain model or publication lifecycle.