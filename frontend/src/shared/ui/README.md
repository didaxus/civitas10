# Civitas shared UI primitives

## FormField

Wraps one existing form control with a Civitas label, optional required marker, hint, and error text. Keep the input/select/textarea logic in the calling page and apply the existing `civitas-field` class to the control.

## AlertStrip

React wrapper for the `civitas-alert` visual primitive. Use `variant="danger"` for blocking user-facing errors and keep technical diagnostics in logs rather than visible DOM copy.

## Stepper

Displays the current wizard step with completed, active, and pending states. Pass stable step ids and a zero-based `activeStep` from the parent wizard state.

## Governance workspace primitives and patterns (#130)

Governance screens compose the public exports from `frontend/src/shared/ui/index.ts`; feature code must not import from `shared/ui/patterns/*` directly. The pattern layer is internal to the existing entrypoint, not a second design system.

Reusable primitives:

- `OrganizationContextHeader` — compact entity context with breadcrumb, status and action slots; do not pair it with a second page hero for the same organization.
- `GovernanceSectionNav` — primitive retained for non-workspace consumers. It must not be mounted inside Governance: organization navigation belongs exclusively to the blue `AppShell` sidebar.
- `RoleSelector` — controlled role selector that shows canonical role IDs, tenant aliases and status without replacing the stable ID.
- `PermissionGroupAccordion` — accessible domain accordion with group/row toggles, mixed state and counts.
- `FilterBar` — composable search/filter/reset toolbar suitable for URL-backed state supplied by the screen.
- `SplitView` — responsive list/detail or canvas/detail layout.
- `MetricStrip` — compact operational metrics, not a dashboard-card grid substitute.
- `DecisionState` — safe allowed/denied/limited/pending/unavailable presentation with reason-code text only.

Reusable patterns exported from the same barrel: `EntityWorkspace`, `SettingsWorkbench`, `MasterDetail`, `GroupedToggleList`, `HierarchyWorkbench`, `FilterToolbar`, `FormDrawer` and `ResponsiveDataView`.

All CSS for these primitives lives in `styles/primitives.css` and consumes `--civitas-*` tokens from `styles/tokens.css`/`styles/theme.css`. The `validate:governance-visual-contract` script fails shared UI code that introduces raw palette values, arbitrary governed Tailwind utilities, endpoint calls or local authorization logic.
