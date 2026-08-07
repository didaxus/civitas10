# Issue #319 — Governance authorization UX architecture

## Final route architecture

Owner routes use `/owner/organizations/:organizationId/governance/...`; tenant routes use `/o/:organizationId/settings/governance/...`. Data Scopes and Structure are organization-model surfaces. Scope Assignments and Access Explorer remain under Access policy. Direct routes are protected by backend decisions and do not rely on navigation visibility.

## Decision and treatment flow

The frontend consumes generated lifecycle action contracts and requests a tenant-bound `AuthorizationUiDecision`. The backend canonical pipeline evaluates identity, RBAC role potential, PBAC entitlement policy (Owner Ceiling and Tenant Activation), ABAC Data Scope, authorization snapshot, module/runtime, and resource state. React validates subject, organization, action, and snapshot before protected queries. `hide`, `disable`, `filter`, `block`, and diagnostic `explain` treatments come from that decision; components do not interpret role names.

Access Explorer requires `organizationModel.inspectAuditHistory`, then asks the backend to re-evaluate the referenced canonical action. It shows only backend-returned safe stages, reasons, versions, remediation, access mode, and current/superseded reference status. It never reads tokens, raw claims, credentials, or restricted evidence.

## Context invalidation and protected queries

Organization, authentication, subject, action, and snapshot are query-key inputs. Context changes enter loading immediately, unmount protected payloads, abort reads and mutations, close tenant-keyed drawers through remounting, and request a current decision. Focus, visibility, authorization-context events, and bounded background revalidation refresh decisions. Every backend endpoint independently repeats canonical authorization; navigation is not a security boundary.

## Bounded contexts

Data Scopes owns mapping policies, selector sets, evaluations, reviews, canonical dimensions, and publication history. It never creates or mutates authorization scope assignments. Structure projects and edits the same organization-model draft and consumes only backend graph and primary Scope Tree projections. Publication uses exact preview digests and versions. Rollback creates a new draft. Reconciliation work is non-grant and never mutates assignments.

## Reason-code and data-surface policy

Backend reason codes remain intact through API errors, boundaries, disabled actions, publication blockers, and Access Explorer. Missing RBAC potential is non-discoverable; remediable PBAC failures are disabled with safe remediation; unavailable identity/snapshot/runtime states block. Collections, exact reads, history, traces, and evidence are authorized server-side. No browser-side ABAC filtering, exports, or hidden totals exist in these surfaces.

## Accessibility and responsive behavior

Tabs use tab semantics; graph and relationships have keyboard-operable lists; the Scope Tree is keyboard navigable; relationship meaning includes text and icons; state changes use live regions; disabled controls expose reasons; and shared `FormDrawer` provides focus containment and restoration. Layouts wrap and avoid page-level horizontal scrolling at zoomed widths.

## Completion matrix

| Capability | Production implementation |
| --- | --- |
| Generated action contracts | Complete |
| Backend decision envelope | Complete |
| Data Scopes workspace | Complete |
| Structure graph and Scope Tree | Complete |
| Exact preview, publication and rollback draft | Complete |
| Reconciliation presentation | Complete |
| Access Explorer safe diagnostics | Complete |
| Tenant/subject/snapshot invalidation | Complete |
| Scope-assignment automatic mutation | Intentionally excluded |
| Segmentation and Access Explorer expansion beyond organization mapping | Deferred external scope |

## External validation

Deployment must validate Logto role-path configuration, PostgreSQL migrations, module availability, and authorization snapshot propagation in the target environment. These are operational validation responsibilities; there is no frontend mock or bypass fallback.
