# CIVITAS — Organization Onboarding provider-neutral rebase

**Código:** ONB-00A  
**Estado:** enmienda normativa de rebase  
**Aplica a:** PR #248 / Organization Onboarding v1.2.1  
**Foundation:** #342–#356, especialmente #344, #346, #347, #348–#356  
**Reconciliación:** #333

## 1. Precedencia y alcance

Esta enmienda corrige contradicciones de autoridad introducidas por lenguaje Logto-first en el paquete de onboarding. Preserva la arquitectura de aggregate, resume/deep-links, dry-run, approval, activation, publication, Tenant Resolution y los patrones UX ya aprobados.

Ante conflicto semántico:

```text
ONB-00A provider-neutral rebase
→ 00-CIVITAS-ORGANIZATION-ONBOARDING-AND-ACTIVATION-v1.2.1.md
→ documentos derivados/reviews/audits
```

Los `.docx` de review son perfiles derivados; no pueden redefinir esta enmienda ni el contrato canónico.

## 2. Autoridad canónica corregida

```text
Civitas owns
- onboarding aggregate and lifecycle
- canonical organizationId
- canonical subjectId
- canonical membership/access model
- desired provisioning state
- role and permission vocabulary
- Owner Ceiling / Tenant Activation
- Organization Model / Structure
- Segmentation
- Scope Assignment Policies
- authorization decisions
- provenance, audit and reconciliation
- Tenant Resolution
- Branding publication

Platform Identity Provider owns
- authentication
- provider session
- token issuance
- external/provider identities
- external/provider organization and membership materialization when supported
- provider-side role materialization when configured

Active provider today
- Logto
```

Provider state is materialized state, not Civitas domain authority.

## 3. Bootstrap semantics

The existing bootstrap flow is preserved, including `runCanonicalOrganizationProvisioning()`, but its semantic contract changes:

```text
Onboarding aggregate
→ canonical Civitas organization/subject state
→ desired identity state
→ seat/entitlement gate
→ operation/outbox
→ IdentityProviderAdapter
→ active provider (Logto today)
```

`runCanonicalOrganizationProvisioning()` remains an orchestration entry point; it must not directly make Logto the canonical source for organization, membership or authorization identity.

Successful provider creation is not onboarding completion.

## 4. Canonical organization and provider binding

The onboarding contract distinguishes:

```text
organizationId
= canonical Civitas organization identity

provider organization identifier
= external reference stored through verified provider binding
```

No provider organization identifier may be persisted or propagated as a substitute for canonical `organizationId` in Governance, Tenant Resolution, authorization, jobs, audit or business-module contracts.

Ambiguous or missing provider bindings fail closed; no heuristic backfill or name/email matching grants authority.

## 5. Subject and membership semantics

The onboarding package must not assume every provider exposes a universal membership object or stable membership ID.

Normative interpretation:

```text
subjectId
= canonical Civitas subject

canonical membership/access state
= Civitas organization membership used by authorization/session/governance

provider subject/membership identifiers
= optional external bindings/evidence
```

Any existing `organization_membership_id` wording that denotes a Logto/provider membership is non-canonical and must be treated as provider binding material, not the membership authority used by Civitas.

## 6. Identity materialization vs authorization materialization

Two distinct pipelines exist and must never be conflated.

### Identity materialization

```text
Onboarding desired identity state
→ seat gate
→ operation ledger/outbox
→ IdentityProviderAdapter
→ provider subject/membership/managed role projection
```

### ABAC/Data Scope materialization

```text
canonical onboarding facts + Organization Model + governed evidence
→ Predicate Engine
→ Segmentation / Scope Assignment Policy
→ #331 only
→ authorization_scope_assignments
```

Onboarding, Organization Mapping and Segmentation never directly write `authorization_scope_assignments`.

## 7. Permanent Governance services

Onboarding is a workflow over permanent domain services, not a parallel IAM engine.

The onboarding package consumes:

```text
Organization Model / mapping-policy services (#318/#329)
Segmentation (#330)
Scope Assignment Policies (#331)
Authorization Decision Envelope (#348)
Action Registry (#349)
Evidence Classification (#350)
Impact Digest / publish preconditions (#351)
Governance outcome boundaries (#352/#354)
Reconciliation triggers (#356)
```

Onboarding-specific persistence may store workflow references and snapshots, but it must not create alternate role, predicate, segment, Data Scope or organization-model engines.

## 8. Organization Model and TeachingAssignment

Any onboarding teaching/structure assignment references canonical published Organization Model values/versions. It does not create an onboarding-only taxonomy.

If structure/model evidence changes after preview, downstream plans become stale and must be regenerated according to #351/#356.

## 9. Scope Assignment Builder

Any onboarding `DataScopeAssignmentBuilder` or equivalent UX is an orchestration surface over #331 APIs/contracts.

It must express:

```text
WHO
+ canonical ROLE PATH
+ WHERE (published Organization Model / Context Set)
```

It cannot create direct user-to-scope assignments outside Scope Assignment Policy ownership.

## 10. Authorization UX

Frontend actions consume the backend Authorization Decision Envelope and Action Registry.

The UI does not infer authorization from:

- role names;
- onboarding step names;
- provider groups;
- provider memberships;
- presence of a provider account;
- client-side predicate evaluation.

Authorization state is bound to canonical `organizationId`, `subjectId` and snapshot/version context.

## 11. Tenant Resolution dependency

Organization Portal onboarding routes preserve the PR #247 model:

```text
hostname
→ TenantContext
→ authentication
→ canonical subject/membership
→ authorization
→ onboarding resource ownership
```

The browser-visible tenant route never uses provider organization IDs and never permits a token/provider claim to switch tenant.

## 12. Provider capabilities

Onboarding calls `IdentityProviderAdapter` from #346. Provider-specific capabilities may vary.

When a capability is unsupported, onboarding must expose an explicit blocked/manual/degraded state. Domain code must not branch on `provider === "logto"` outside the provider adapter/compatibility boundary.

## 13. Failure and asynchronous execution

Provider mutations use the established operation/outbox/worker pattern:

```text
desired state
→ persist operation + preconditions
→ enqueue
→ worker reloads current onboarding/tenant state
→ revalidate organization, actor authorization and destructive preconditions
→ provider adapter
→ persist provider result/binding
```

Retries are idempotent and tenant-bound. Revocation, membership change, approval invalidation or plan drift after enqueue must be revalidated at execution time.

## 14. Evidence, diagnostics and secrets

Provider responses, SCIM evidence and connector diagnostics follow #350 classification/redaction. Provider identifiers are support/evidence fields, not primary UI identity. Tokens, assertions and credentials are never exposed in normal onboarding payloads.

## 15. Completion criterion

Onboarding completion means the approved Civitas target state is published/activated and required provider projections are converged according to capability and policy. It never means merely “Logto organization created”.

## 16. Portability gate

Before this contract is considered provider-neutral:

- fake Identity Provider passes onboarding adapter contract without Logto concepts;
- Logto parity remains green;
- canonical organization/subject/membership survive provider swap;
- provider IDs do not appear as business-domain primary keys;
- onboarding Governance/authorization paths run without direct Logto SDK/Management API dependency;
- two-tenant adversarial tests prove no provider binding or async operation crosses organizations.

## 17. Decisión final

> Organization Onboarding is a Civitas Governance workflow that creates and publishes canonical tenant/identity/governance state, then projects approved identity state through the Platform Identity Provider. Logto is the active provider implementation, not the canonical authority for Civitas organization, subject, membership or authorization semantics.