# CIVITAS Data Scope Taxonomy v2

**Contract version:** `civitas-data-scope/v2`  
**Implements:** issue #218  
**Status:** `normative / blocking`

## 1. Purpose

Data Scope defines the dimensions and strategies used to constrain visibility after identity, role and permission evaluation. It never grants access by itself.

The taxonomy is tenant-bound and provider-neutral.

## 2. Canonical dimensions v2

```yaml
academic:
  - stage
  - period
  - subject
  - course
  - cohort
  - class

organization:
  - campus
  - shift
  - department

administration:
  - function
```

## 3. Deprecated dimensions

The following v1 concepts are removed as canonical dimensions:

```text
academic.grade_level
academic.section
```

They may exist only in migration evidence, never as runtime authorization dimensions.

Permanent aliases are forbidden because they hide semantic ambiguity.

## 4. Registry model

Three registries are separate:

```text
Taxonomy Dimension Registry
  What dimensions exist

Data Scope Strategy Registry
  How a dimension is evaluated

Scope Template Registry
  How approved defaults are composed
```

A dimension does not grant access. A strategy does not grant access. A template does not override permission.

## 5. DataScopeEvaluationRequest

All evaluators use one contract:

```json
{
  "organizationId": "...",
  "principalId": "...",
  "permissionId": "...",
  "resourceType": "...",
  "resourceId": "...",
  "requiredDimensions": [
    "academic.class"
  ],
  "strategyVersion": "...",
  "scopeTemplateVersion": "...",
  "snapshotVersion": "..."
}
```

Legacy request shapes are migrated or rejected.

## 6. Strategy examples

```text
academic.class
  exact membership/class assignment

academic.cohort
  cohort membership evaluation

organization.campus
  organizational placement evaluation

administration.function
  administrative responsibility evaluation
```

## 7. Missing scope behavior

```text
missing required scope
= deny
```

Never:

```text
missing scope
→ organization-wide
```

## 8. External mappings

SCIM groups, SIS imports and external directories provide evidence or candidates only:

```text
external group
→ mapping rule
→ canonical role/scope candidate
→ Civitas validation
→ materialized assignment
```

External group names are not canonical dimensions.

## 9. Migration requirements

#218 must provide:

- v1 inventory;
- mapping decisions;
- data migration script;
- validation report;
- removed dimension evidence;
- regenerated scope artifacts;
- rollback plan.

## 10. Tests

Required:

- deprecated dimension rejected in runtime;
- missing scope denies;
- cross-campus denied;
- wrong cohort denied;
- class leakage denied;
- template version mismatch denied;
- tenant mismatch denied;
- strategy version mismatch denied.

## 11. Activation impact

Until taxonomy v2 migration and gates pass:

- new sensitive modules remain blocked;
- Planning activation remains gated;
- MCP write tools remain blocked.

## 12. Rollback

Rollback is migration-aware:

- preserve evidence of v1 mapping;
- restore previous artifact version only behind explicit compatibility mode;
- never reactivate deprecated dimensions as silent runtime aliases.
