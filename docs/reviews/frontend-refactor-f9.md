# Frontend refactor F9 — Administration

Status: implemented and tested locally. User authorized sequential local commits/dev-local merges through F11, with clarification stops when requirements/policy are missing. No push/release authorization.

## Scope and sources

Routes `/admin/users`, `/admin/users/new`, `/admin/periods`; existing account, period and shared administrative dialogs. Canonical Design System 1.1, linked interaction/component/verification specifications and frontend guidance; supplied F9 prompt; rough administration references and mobile JPEGs; approved administrator lifecycle/permissions PRD; actual account snapshot/references/create/update/archive, period and permission code plus tests. UI/UX/design-taste/principles/copy/accessibility/React/Next guidance applied to the existing operational UI.

## Implemented

- Scoped consistent form/card spacing, readable labels and table metadata, long-word wrapping, mobile card/table reflow and keyboard-accessible labeled account-table scroll region. Existing filters, cached instant search and 20-row paging remain unchanged.
- Administrative modal gutters, controls and grids remain usable at narrow widths/200% text. Transitions affect colors/borders/shadows only, preventing geometry animation when text changes. Existing edit/archive/reset/permissions confirmations and pending behavior are retained.
- Period selection footer is in document flow on mobile/tablet, sticky only on desktop, so its action does not overlap the floating navbar. Existing 200-member limit, review, extension and historical membership rules remain untouched.
- Account/period member rendering now suppresses cached private records and counts after authoritative query failure, rather than displaying stale names alongside an error. Assignment cannot proceed when required snapshot/period reads fail. Form values/filter state remain in memory for recovery. Successful credentials still use the existing direct client response, never a query/mutation cache or persistence.
- Existing SUPERADMIN SSR guard, server authentication/authorization, lifecycle/account status, concurrency version checks, audited mutations and historical records are unchanged. No administrative operation added. Backup widget remains as implemented; no real backup was invoked.

## Verified

- Frontend account-status, credentials, permissions, interaction and new cached-error regression suites: 48 passed / 1,746 assertions across five files. Two new tests execute the account list and period workspace with cached data plus read error and verify private names/email and false zero counts are absent.
- Backend account administration and permission contract unit suites (synthetic/in-memory doubles): 21 passed / 164 assertions. Combined: 69 tests / 1,910 assertions. No live database test or real-user mutation.
- Web typecheck, focused Biome, architecture (no exceptions) and diff checks passed. Isolated Next webpack build passed after the existing advisory CLI retry; no dependency upgrade.
- Actual Chromium 158.0.8127.18: all three routes at 320/390/768/1024/1440 light/dark and 200% text/spacing; account search/filter/page20; edit failure retains input and masks private errors; archive/reset/access dialogs opened and cancelled; create validation, failed input retention, synthetic success and credential DOM removal on exit; period selection/review/create/extension validation without real mutation; focused enlarged modal close visible; mobile period footer above nav; forbidden refresh hides cached account/period names; empty/loading/retry; non-SUPERADMIN direct access to all three routes redirects. No runtime errors or page overflow.
- Screenshots inspected: mobile account cards, period footer and enlarged period review, plus matrix captures/results in `output/playwright/f9/`. Browser POSTs were intercepted local fixtures, limited to synthetic update/create scenarios.

## Impact and limits

No API, dependency, schema/migration, data, environment, authentication/authorization policy, account lifecycle or audit change. Existing in-memory snapshot retention/query frequency is preserved; disk persistence remains a separate F10 policy gate. Real DB authorization/concurrency/audit, actual backup/download, real devices/Safari/Android/Brave, native screen readers, field performance and PM UAT remain unverified. Local fixture success is not a release certification.
