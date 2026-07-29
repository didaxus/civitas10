# CIVITAS Data Scope Taxonomy v2

> **Historical legacy strings: explicitly marked.** Any `academic.section` or `academic.grade_level` below is retained only as historical/migration evidence; it is not an active alias.


**Contract version:** `civitas-data-scope-taxonomy/v2`  
**Implements:** issue #218  
**Status:** `normative / blocking`

## 1. Separation of concepts

```text
Taxonomy dimension
  describes an organizational or academic axis

Dimension value
  tenant-owned value within an axis

Data Scope strategy
  algorithm that converts facts/assignments into constraints

Scope template
  Owner-governed reusable configuration

Scope assignment
  membership/role/capability-bound grant input
```

A taxonomy value never grants permission by itself.

## 2. Canonical dimensions v2

```text
academic.stage
academic.period
academic.subject
academic.course
academic.cohort
academic.class
organization.campus
organization.shift
organization.department
administration.function
```

Removed from active contracts:

```text
academic.grade_level
academic.section
```

They may appear only in migration fixtures and historical audit evidence.

## 3. Academic terminology freeze

```text
Subject
  discipline or area of knowledge

Course
  curricular definition, independent of one delivery instance

Class / CourseOffering
  instance taught for a period, cohort, campus or shift

Cohort
  progression/admission group that may span classes

Group
  operational membership/resource grouping; not a taxonomy synonym

Stage
  educational stage or level family, not an access grant

Period
  academic time window
```

The public canonical resource may use `class` while an LMS adapter maps provider-specific course offerings behind a port. The mapping must be explicit.

## 4. Dimension lifecycle

```text
draft -> active -> deprecating -> archived
```

- archived values cannot grant new access;
- deprecating values follow an explicit compatibility window;
- parent relationships remain same-tenant and same-dimension;
- all values carry stable key, version, provenance and tenant ownership.

## 5. Migration from v1

No permanent alias is permitted.

For every existing `academic.grade_level` or `academic.section` value/assignment:

1. inventory consumers and assignments;
2. classify the semantic target (`stage`, `cohort`, `class`, or none);
3. require explicit migration decision;
4. create the target value;
5. migrate assignments with actor/reason/provenance;
6. invalidate snapshots;
7. verify zero active references;
8. archive the legacy value;
9. fail CI if active code still references the legacy key.

Ambiguous records remain `migration_required`; they never widen access.

## 6. Strategy registry v2

The registry preserves named strategies such as:

```text
organization
organization_and_units
self
academic_relationship
teaching_assignments
planning_relationship
planning_editable
planning_owned
assigned_reviews
assigned_approvals
approved_plans
community_membership
community_moderation
hr_relationship
payroll_relationship
scheduling_relationship
support_relationship
communication_relationship
```

Each strategy declares:

- version;
- required facts;
- allowed dimensions/relationships;
- query constraint kind;
- resource assertion behavior;
- denial reasons;
- sensitive-module restrictions.

`organization` is allowed only for capabilities explicitly approved as organization-wide. It is not a fallback.

## 7. Owner scope templates v2

Templates are versioned, published and availability-gated. They bind:

```text
canonical role
capability
strategy
allowed target kinds
allowed dimensions/relationships
risk limits
```

Tenant configuration may narrow a template, never widen it.

## 8. DataScopeEvaluationRequest

The unified request contains:

```text
organizationId
principal
permissionId
capabilityId
operationId
resourceDescriptor
rolePaths
snapshotVersions
requestContext
```

The policy registry and evaluator must use this shared shape. No adapter may reconstruct an incomplete principal or default the capability/scope.

## 9. Query and resource enforcement

- filter before pagination, count, aggregation and export;
- apply constraints to list, detail, bulk and mutations;
- assert resource tenant and lifecycle in the service/repository;
- return neutral errors across tenants;
- invalidate snapshots when dimensions, assignments or relationships change.

## 10. Required tests

- zero active `academic.grade_level`/`academic.section` references;
- migration ambiguity blocks;
- archived value denies;
- cross-tenant value denies;
- teacher/student/parent/director fixtures;
- missing assignment denies;
- complete-path OR without fragment composition;
- list/count/export parity;
- external SCIM/federation mapping cannot create roles or grants;
- organization strategy is rejected for sensitive capability without explicit approval.
