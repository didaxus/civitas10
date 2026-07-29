# #218 — Taxonomy v2 migration inventory and approved mapping

> **Historical legacy strings: explicitly marked.** The two v1 keys named below exist here solely to document migration decisions. This document does not define aliases.

**Approval status:** approved for PR-D/PR-E implementation  
**Registry:** `contracts/authorization/data-scope-dimensions.yaml`, version `2026-07-v2`

## Explicit decisions (no key-wide alias)

Every row is a decision for a concrete semantic use. A record not matching one of these rows must remain `migration_required` and deny access.

| Inventory class | Existing use | Explicit destination | Reason |
|---|---|---|---|
| definition | v1 section definition | none; deprecate then archive | definitions are replaced by the registry, never aliased |
| definition | v1 grade-level definition | none; deprecate then archive | definitions are replaced by the registry, never aliased |
| values / K-12 presets | section values `primary`, `middle`, `high`, `elementary`, `baccalaureate` | `academic.stage`, preserving stable key | these describe educational stages |
| values / tenant data | either legacy dimension | operator decision per value: `academic.stage`, `academic.cohort`, or `academic.class` | labels alone are insufficient; ambiguity blocks |
| assignments / head-director policy | section target | `academic.stage` | the policy limits a director to an educational stage |
| assignments / other tenant data | either legacy target | destination value chosen for the referenced value | assignment follows an explicit value decision atomically |
| organization mapping / `academic_division` | section | `academic.stage` | division represents a stage family in this model |
| organization mapping / `program` | grade level | `academic.cohort` | existing program binding represents a progression cohort, not a curricular course |
| organization mapping / `custom` | section; grade level | `academic.stage`; `academic.cohort` | both choices remain explicit in the unit registry |
| scope-candidate policy | division-lead-to-section rule | division-lead-to-stage rule using `academic.stage` | preserves rule provenance under a new versioned rule id |
| diagnostics / tests / UI fixture | section examples | `academic.stage` | active examples must exercise the canonical contract |
| historical architecture and audit evidence | either v1 key | no destination; retain only with historical marker | evidence must not become executable configuration |

## Complete repository inventory

* **Definitions:** the original SQL constraint in migration `0008`; hard-coded runtime definitions formerly in `taxonomyValidation.js`; the v1 array formerly in `dataScopeRegistry.js`.
* **Values:** K-12 preset values and tenant-owned `organization_dimension_values` selected by the migration plan.
* **Assignments:** `authorization_data_scope_assignments` rows referencing selected values, including head-director LMS assignments.
* **Presets:** `school_k12` and `school_international`; both now explicitly target stage and use preset version `2026-07-v2`.
* **Policies:** head-director LMS required dimension and the academic-division scope-candidate translation rule.
* **Consumers:** taxonomy validation/service, organization unit type registry, scope candidate resolver, data-scope evaluator/registry, governance read-model fixtures, diagnostics, tests, and historical documents/artifacts.

## Operational acceptance

The migration is tenant-scoped and evidence-producing. Dry-run is the default. It reports unresolved decisions and stable-key/display-name collisions without writes. Apply transitions the source through `deprecating` to `archived`, migrates assignments in the same transaction, records actor-controlled decisions and provenance, and retains a rollback snapshot. Replaying an applied migration id is a no-op. A failure restores the tenant snapshot; no other tenant is read or changed.

After migration, the static gate permits the legacy strings only in database/migration implementation, specifically named rejection or migration fixtures, repository artifacts, and documents carrying the historical marker above.
