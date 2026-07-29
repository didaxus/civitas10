# CIVITAS Phase 3 — Legacy UX Navigation Mockup Reconciliation

> **Historical legacy strings: explicitly marked.** Any `academic.section` or `academic.grade_level` below is retained only as historical/migration evidence; it is not an active alias.


- **Version:** 1.0
- **Status:** reconciled audit / non-normative source review
- **Repository:** `didaxus/civitas10`
- **Target contracts:** PR #247 Tenant Resolution, PR #248 Organization Onboarding, PR #249 Phase 3 Governance
- **Source mockups:**
  - `Civitas – Permission Manager.html`
  - `MEMBERS.html`
  - `Menú Civitas – IAMGen palette.html`
  - `menu side bar navigation.html`

## 1. Purpose

This audit evaluates whether a real user can identify where they are, move to a task and return without relying on browser history. It does not approve visual styling or convert the mockups into normative UI contracts.

The precedence rule is:

```text
Tenant Resolution / Onboarding / Authorization / Phase 3 contracts
  -> route and navigation registries
  -> issues and implementation PRs
  -> reusable UI primitives
  -> historical mockups as non-normative references
```

A mockup may contribute an interaction pattern. It may not define canonical routes, permissions, role identities, taxonomy dimensions, tenant selection, authorization behavior or production data.

## 2. Executive verdict

```text
Useful interaction patterns:       YES
Navigation contract complete:      NO
Cross-workspace consistency shown: NO
Tenant-safe navigation shown:      NO
Mobile navigation complete:        NO
Safe to copy source HTML:          NO
Safe as historical reference:      YES, after sanitization
```

A new user would lose orientation in the Permission Manager and sidebar-only mockups because the active organization, workspace, section hierarchy and return path are not simultaneously visible.

`MEMBERS.html` provides a local list-to-detail return action, but still does not establish a route-backed breadcrumb or a consistent organization/workspace shell.

## 3. Canonical navigation model after reconciliation

### 3.1 Core Manager / Administrador Didaxus

```text
/owner/organizations
/owner/organizations/:organizationId
/owner/organizations/:organizationId/governance/access-policy/roles
/owner/organizations/:organizationId/governance/access-policy/role-names
/owner/organizations/:organizationId/governance/access-policy/scope-assignments
/owner/organizations/:organizationId/governance/organization-model/structure
/owner/organizations/:organizationId/governance/organization-model/groups
/owner/organizations/:organizationId/governance/organization-model/segments
/owner/organizations/:organizationId/governance/control/access-explorer
/owner/organizations/:organizationId/governance/control/audit
```

The Owner route contains `organizationId` because Core Manager can operate across organizations. Every organization-level page must show the selected organization and provide a deterministic return to its organization overview.

### 3.2 Organization Portal / Administrador de la organización

```text
/settings
/settings/governance
/settings/governance/access-policy/roles
/settings/governance/access-policy/role-names
/settings/governance/access-policy/scope-assignments
/settings/governance/organization-model/structure
/settings/governance/organization-model/groups
/settings/governance/organization-model/segments
/settings/governance/control/access-explorer
/settings/governance/control/audit
/settings/branding
/onboarding
```

The browser-visible tenant route never contains `organizationId`. Tenant Resolution provides the organization through the authoritative hostname, BFF session and `TenantContext`.

### 3.3 Operational workspaces

Teacher, Student and Parent do not inherit the Governance menu. They use the same shell grammar—context header, global navigation, breadcrumb and responsive navigation—but receive different routes and task labels from their own route registry.

```text
same navigation grammar
!=
same menu entries
```

## 4. ✅ Solid navigation patterns to preserve

### 4.1 Permission Manager

Preserve as reusable primitives, not copied markup:

- searchable permission list;
- domain-group accordion;
- active/total counter;
- individual and controlled group toggles;
- visible blocked reason;
- pending-change indicator;
- explicit discard and save actions;
- keyboard activation for controls;
- table-to-stacked-content adaptation on small screens.

Required reinterpretation:

```text
Owner surface toggle
  = Owner Ceiling

Tenant surface toggle
  = Tenant Activation within the Owner Ceiling
```

The same visual primitive may be reused, but the two write contracts and explanatory copy must remain distinct.

### 4.2 Members list/detail

Preserve:

- searchable list;
- row-to-detail transition;
- explicit local return control;
- compact status presentation;
- filter bar;
- list/detail responsive composition;
- detail sections for profile, security, sessions and audit when permitted;
- empty result state.

Required reinterpretation:

- filters are URL-backed;
- detail is a real route, not hidden DOM state;
- back action resolves to the canonical parent route;
- tabs/sections are capability-filtered;
- academic information is read from canonical relationships and Data Scope, not frontend arrays.

### 4.3 Owner sidebar mockups

Preserve:

- grouped domains;
- parent/child indentation;
- collapsible groups;
- clear active item;
- compact labels;
- semantic color tokens;
- subtle scrollbar;
- separation of global navigation from page content.

Required reinterpretation:

- active state comes from the router, not click-local state;
- sidebar does not own organization context;
- the organization context header and breadcrumb remain visible;
- no fixed desktop-only layout;
- global `Organizations`, `Create` and `Directory` entries exist only in Core Manager.

### 4.4 Onboarding mockup

Preserve only as the historical bootstrap composition:

```text
organization
admins
segmentation
review
```

It remains useful as a compact form pattern, validation summary and final-review card. It does not define the complete onboarding, activation plan, approval, publication or delegated Organization Portal workflow.

## 5. ⚠️ Navigation friction findings

### UX-NAV-P1-001 — Permission Manager has no location context

The page shows `Civitas`, a role selector and search. It does not show:

- selected organization;
- Owner vs Organization Admin workspace;
- Governance parent;
- current section;
- breadcrumb;
- parent route.

**Real user impact:** an administrator managing multiple organizations cannot prove which tenant is being changed. This is a navigation and operational safety failure, not a cosmetic omission.

**Required shell:**

```text
breadcrumb
OrganizationContextHeader
GovernanceSectionNav
Role permissions workspace
pending-change action bar
```

### UX-NAV-P1-002 — Members detail has only a local arrow

The detail view includes an arrow to return to the list, which is useful. It does not expose a clickable hierarchy such as:

```text
Organización / Personas / Miembros / <persona>
```

**Real user impact:** a deep link or refresh does not explain how the user arrived there, and the local arrow cannot represent a 3-level parent hierarchy.

### UX-NAV-P1-003 — Active sidebar state contradicts page content

The owner navigation mockups can show `Operations` active while the page content displays `Create organization` or `Dashboard`.

**Real user impact:** the user receives two conflicting answers to “where am I?”.

**Rule:** exactly one route-derived active leaf; parent groups may be expanded but are not marked as the current page unless they have their own real route.

### UX-NAV-P1-004 — Governance menu is too long and structurally flat

Ten or more technical entries under one expanded Governance parent increase scanning cost and hide task relationships.

Use three groups:

```text
Política de acceso
  Roles y permisos
  Nombres de roles
  Alcances de datos

Modelo de organización
  Estructura y clasificación
  Grupos y clases
  Segmentación de personas

Control y evidencia
  Explorador de acceso
  Auditoría
```

### UX-NAV-P1-005 — No route-backed shortcuts

The mockups do not provide:

- recent organizations;
- resume onboarding;
- pending approvals;
- unresolved findings;
- saved filters;
- direct teacher/student frequent tasks.

Shortcuts must be capability-aware and route-backed. They may reduce clicks but never bypass authorization or tenant resolution.

## 6. ❌ Pattern breaks and orientation loss

### UX-NAV-P0-001 — Legacy tenant routes conflict with Tenant Resolution

The historical Governance issues use:

```text
/o/:organizationId/settings/governance/*
```

The Organization Portal contract requires host-local routes:

```text
/settings/governance/*
```

`organizationId` remains in Core Manager Owner routes only.

**Disposition:** all affected issues must carry the new route model before implementation or further migration.

### UX-NAV-P0-002 — Workspace pattern is not demonstrated across Admin/Teacher/Student/Parent

No mockup demonstrates the same shell grammar in all workspaces. Therefore cross-workspace predictability is **not covered**.

The minimum common pattern is:

```text
Topbar
  organization identity + actor/workspace + account actions

Global navigation
  entries produced by route registry and capabilities

Breadcrumb
  clickable parents + current page

Context header
  section title + status + primary action

Responsive navigation
  drawer/select replacement, not hover-only behavior
```

### UX-NAV-P0-003 — Hover-only compact sidebar is not a functional mobile pattern

`MEMBERS.html` expands a compact sidebar on hover. Touch devices do not have reliable hover, keyboard users cannot discover labels consistently and the content can change width while navigating.

**Disposition:** reject hover expansion as the only navigation mechanism. Use an explicit desktop collapse control and a mobile drawer/select with focus management.

### UX-NAV-P0-004 — Mock permission and role identities may create false authority

Examples such as `Organization Manager`, `Viewer`, `lms.courses.create`, `lms.courses.delete`, `org.billing.manage` or other local IDs are not authoritative merely because the mockup contains them.

**Disposition:** UI fixtures must be generated from, or validated against, the canonical permission and role registries. Unknown IDs fail tests.

### UX-NAV-P0-005 — Obsolete academic labels conflict with Data Scope v2

The Members mockup uses `Grados`, `grado` and an implicit Grade/Section model. Phase 3 Data Scope v2 removes active `academic.grade_level` and `academic.section` contracts.

Use explicit user-facing concepts derived from:

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

A taxonomy value never grants access by itself.

### UX-NAV-P0-006 — Sensitive-looking fixture data must not be retained

The Members mockup contains realistic names, emails, phones, IP addresses, OAuth details and a refresh-token-shaped value.

**Disposition:** do not commit or quote the source HTML unchanged. Any retained reference must replace all identities and credentials with unmistakably synthetic fixtures and pass secret scanning.

## 7. 🔲 Permission, responsive and empty-state gaps

### 7.1 Menu eligibility

The mockups do not consistently define whether unavailable navigation is hidden, disabled or forbidden.

Canonical policy:

| State | Navigation behavior |
|---|---|
| Not eligible by role/capability | Hidden from normal navigation |
| Eligible but module/capability planned or unavailable | Visible only where useful, disabled with reason and recovery path |
| Direct deep link without permission | Preserve safe shell and parent navigation; show neutral forbidden state |
| Cross-tenant mismatch | Fail closed before resource lookup; do not reveal existence |
| Empty authorized dataset | Show empty state, not forbidden |

### 7.2 Empty and recovery states

Every routed screen must define:

```text
loading
empty
unavailable
forbidden
error
stale/conflict
not applicable
```

A state must include:

- what happened;
- impact;
- responsible actor;
- safe next action;
- route of return;
- request/correlation ID when useful;
- no secrets or unrelated tenant identifiers.

### 7.3 Mobile

Required order for complex administration pages:

```text
1. organization + actor/workspace + status
2. section selector/drawer
3. breadcrumb or compact parent trail
4. dominant warning/readiness state
5. content
6. sticky primary action + overflow for secondary actions
```

Permission tables may stack into cards. Global navigation must not depend on fixed width, hover or horizontal tab scrolling.

## 8. Menu terminology

Visible default language is Spanish.

Recommended labels:

| Technical/internal | User-facing label |
|---|---|
| Owner | Administrador Didaxus |
| Organization Admin | Administrador de la organización |
| Governance | Gobierno |
| Access policy | Política de acceso |
| Role permissions | Roles y permisos |
| Role names | Nombres de roles |
| Scope assignments | Alcances de datos |
| Structure | Estructura y clasificación |
| Groups and courses | Grupos y clases |
| People segmentation | Segmentación de personas |
| Access explorer | Explorador de acceso |
| Audit log | Auditoría |
| Onboarding | Configuración inicial |
| Readiness | Preparación |

OIDC, SAML, SCIM, PBAC, ABAC, API and Data Scope may remain on technical screens only when accompanied by a functional explanation.

## 9. Click depth targets

### Core Manager

```text
Organizations list
  -> organization overview                  1 click
  -> frequent Governance task               2 clicks
  -> record/detail/finding                   3 clicks
```

### Organization Portal

```text
Home
  -> Settings/Governance                     1 click
  -> frequent Governance task                2 clicks
  -> record/detail/finding                   3 clicks
```

### Operational workspace

A frequent teacher or student task should normally be reachable in 1–2 clicks from workspace home. A third level is acceptable for a particular resource, submission, student or assessment.

No common task should require opening a global organization selector inside the Organization Portal.

## 10. Reusable component decisions

The accepted patterns should be implemented through shared primitives:

```text
OrganizationContextHeader
WorkspaceIndicator
Breadcrumbs
GovernanceSectionNav
MobileSectionDrawer
RoleSelector
PermissionGroupAccordion
PendingChangesBar
FilterBar
SplitView
DecisionState
EmptyState
StatusPill
RouteBackLink
```

Constraints:

- controlled components;
- canonical tokens only;
- router-derived active state;
- URL-backed filters;
- capability-filtered actions;
- keyboard and screen-reader behavior;
- no feature-local navigation framework;
- no permission or tenant inference in presentation code.

## 11. Required issue updates

### #130

Keep the reusable primitives and remove the embedded raw HTML as a normative source. Add this reconciliation and PR #247/#249 as authorities.

### #131

Preserve the single Organization Overview and compact context header. Confirm breadcrumb parents are clickable and route-derived.

### #132–#139

Update all tenant-visible paths from:

```text
/o/:organizationId/settings/governance/*
```

to:

```text
/settings/governance/*
```

Preserve Owner paths under `/owner/organizations/:organizationId/governance/*`.

### #132

Separate Owner Ceiling and Tenant Activation; never expose one ambiguous switch.

### #134

Use Data Scope Taxonomy v2 and explain that taxonomy dimensions do not grant permission.

### #136

Freeze Subject, Course, Class/CourseOffering, Cohort and Group terminology.

### #137

Show the complete decision path and reason codes, not a flat role/capability list.

### #139

Segmentation is evidence/filtering, not a permission authority.

## 12. Acceptance gate

The reconciliation is complete when:

- no active tenant issue uses `/o/:organizationId/settings/*` as a browser route;
- all routes have a clickable parent model;
- every page displays organization, workspace and section context;
- Owner and tenant permission editors expose distinct semantics;
- legacy Grade/Section terminology is removed from active UI contracts;
- no fixture contains realistic credentials or PII;
- mobile navigation works without hover;
- menu labels are localized and task-oriented;
- route/action visibility comes from the canonical registry;
- the four HTML files remain non-normative or are stored only in sanitized historical form.

## 13. Final decision

```text
Use the useful interaction patterns: YES
Copy the mockup navigation model: NO
Copy mock roles/permissions/data: NO
Update Governance UX issues: YES
Change Tenant Resolution to fit old routes: NO
Change Onboarding to four steps: NO
Production readiness: NO_GO until repository implementation and UX gates pass
```
