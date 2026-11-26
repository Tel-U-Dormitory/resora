# Frontend refactor F7 — Events and attendance points

Status: implemented and tested locally; PM UAT remains pending. PM authorized sequential F6–F11 execution with a local commit and dev-local merge per phase, stopping for product clarification. No push/release approval.

## Sources and preserved contracts

Supplied F7 prompt; canonical Design System 1.1 and linked guidelines/specifications; rough EventsModulePage/EventDetailView/CreateEventFormPage and mobile JPEG references; NEED-001 PRD and acceptance criteria; actual internal-event list/detail/directory/preview/session operations, points/reporting contracts, frontend and backend unit tests. Existing scoring presenters, formula, CSV names/content, eligibility, snapshot/advanced edit, manual attendance, audit and server transactions remain unchanged.

Scope: `/events`, `/events/[eventId]`, `/events/new`, `/events/[eventId]/edit`, `/events/points`, and their existing related UI components. No backend or dependency changes.

## Implemented

- Authorized event-list response is searched locally by title/description and paginated at 25 rows. The server visibility filter and personal PUBLISHED/VISIBLE restriction remain unchanged. Page resets on filter/search; clamping handles changed results. Empty and no-match states are distinct. Counts explicitly refer to this loaded list, not a global total.
- Events use mobile rows/cards and a wider desktop list. The create/edit form footer is in normal document flow on mobile/tablet to avoid stacking over the floating navbar; it is sticky only on desktop. Existing create/edit controls, participant selection/search, schedule/WIB validation, location/radius controls, and draft/advanced editor behavior are retained. Scoped typography, spacing, long-word wrapping, touch targets and responsive grids cover all five routes.
- Native window.confirm was replaced for close, QR revoke and administrative visibility/deletion with the existing application Dialog primitive and a shared event-only confirmation hook. Scope/consequences and existing server mutations/reason requirements remain unchanged. Initial focus is on the heading, then Batal; Escape/cancel resolve false and restore focus. Duplicate confirmation requests cannot queue a second action; unmount resolves pending confirmation false. Focused controls are scrolled into view; transitions are limited to color/border/shadow so text enlargement does not animate geometry and obscure a focused action. Existing act locks, feedback and live server validation are retained.
- Points adds mobile per-SR summary cards using the existing pointsSummaryValues/labels and locale formatter. Desktop retains the full matrix; mobile can still access it. No recomputation of score or change to export. Both points and participant recap tables have labeled, focusable horizontal scroll regions.
- Detail load errors now expose retry. Existing loading/empty/error feedback, permission gates, filter/search state, CSV and pagination are retained.

## Verification

- Frontend event/points/workflow suites: 51 tests passed, 767 assertions. Includes new authorized-list search/page coverage and updated asynchronous application-confirmation regression tests for all five administrative actions; scoring/recap sibling identity regression remains covered.
- Backend points/reporting unit suites using synthetic/in-memory doubles: 48 tests passed, 519 assertions. No live database integration was run.
- Diagnostic browser pass covered five routes at 320/390/768/1024/1440 in light/dark and 200% text/spacing, real native create-form validation with no mutation, list search/no-result/pagination, close/admin application-dialog cancel/Escape/focus return, enlarged-text dialog keyboard focus, mobile points cards, points search/no-result and keyboard matrix scrolling, loading/error/retry/empty, member restrictions and server points-route redirect. No real mutation or native browser confirm. CSS overrides were used to diagnose wrapping and are not the final acceptance gate.
- Final isolated production build passed (exit 0). Typecheck, focused Biome, architecture (no exceptions) and diff checks passed. The existing Next security-advisory CLI stop required a retry on initial builds; no dependency change was made.
- Final Chromium 158.0.8127.18 run passed without diagnostic CSS overrides: all five routes, five widths/light-dark, text 200%/spacing, no page overflow, form footer fully above the mobile navbar at document end, heading-to-cancel-to-confirm keyboard focus with the focused action visible, cancellation/Escape/focus return, native create validation, list/points search and paging, keyboard matrix scrolling, safe error/retry/loading/empty states and member/points capability checks. Browser CSV download preserved the server filename and applied event IDs even with no search matches. No real mutation or native window confirmation occurred; zero runtime errors.
- Final regression run combined frontend and backend contract suites: 99 passed / 1,286 assertions across seven files.
- Reviewed actual component screenshots (including the inline form footer, mobile points card, and enlarged confirmation) plus results JSON are local in `output/playwright/f7/`.

## Limits and impact

No API, schema/migration, data, dependency, authentication/authorization, scoring, export format or deployment changes. Maps render locally with existing Leaflet controls; external tile requests are blocked in synthetic QA, so network tile availability and physical map/device behavior are not demonstrated. Real device Safari/Android/Brave, native screen readers, real DB authorization/integration, field performance and PM UAT remain pending. Fixture visuals and contract tests do not certify release readiness.
