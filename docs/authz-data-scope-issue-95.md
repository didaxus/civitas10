# Issue #95 Authorization Data Scope Engine

> **Historical legacy strings: explicitly marked.** Any `academic.section` or `academic.grade_level` below is retained only as historical/migration evidence; it is not an active alias.


The data-scope engine is backend authorization over rows/resources after JWT, organization path, canonical scope, role path, owner ceiling, tenant activation, contextual policies, and resource ownership have been evaluated. It is not an OAuth scope, role, visual filter, JWT claim payload, frontend condition, or group permission.

`authorization_scope_assignments` intentionally stores only `dimension`, `unit`, and `resource` targets. `organization` and `self` are strategies, not assignment rows. `identity.self` is therefore resolved dynamically through adapter ownership and is never materialized as an assignment.

Taxonomy-backed dimensions are the #97 keys (`academic.section`, `academic.subject`, `academic.grade_level`, `organization.campus`, `organization.department`, `administration.function`). Relationship selectors such as `academic.assigned_group`, `academic.assigned_course`, and `academic.related_student` are stored in `relationship_key`, not looked up as taxonomy values.

The migration enforces exact target semantics with `num_nonnulls(dimension_value_id, unit_id, resource_ref) = 1`, semantic checks for kind/key/target compatibility, tenant-scoped FKs to #97 taxonomy values and #98 units, valid-time checks, and partial unique indexes for active/scheduled dimension, unit, and resource assignments.

Strategies are platform-owned: director/LMS uses explicit `organization`, headdirector/LMS requires `academic.section`, headteacher/LMS requires `academic.subject`, teacher/LMS consumes relationship ScopeCandidates, student/LMS uses `self`, and parent/LMS consumes related-student relationships. Missing assignments never fall back to organization-wide.

Constraints use a closed AST (`organization`, `dimensions`, `relationships`, `self`, `or`, `deny`). OR is allowed inside one dimension or relationship selector, AND is used between required dimensions, and OR across complete role paths only. Fragments from different role paths are never mixed.

#98 ScopeCandidates are consumed with source, translation rule, role ID, validity, and structure version provenance. A group or unit membership never grants permission by itself; #95 only builds a candidate constraint after token scope, entitlement, policy, and role-path checks are complete.

The LMS adapter is a contract pilot/fake: it applies the same constraint object to list, detail, mutation, count, export, and bulk methods. Real LMS row mapping remains blocked until stable course/group/enrollment/grade/student/teacher IDs exist; labels are never used as identity.

Administration routes remain blocked until #74 promotes active permissions such as `org.authorization_scopes.read` and `org.authorization_scopes.manage`; generic member/settings permissions are not used as substitutes.
