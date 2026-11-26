# Frontend refactor F8 — Committee management

Status: implemented and tested locally. PM UAT/release remains pending. User authorized sequential local commits and dev-local merges through F11, with clarification stops for unresolved product decisions. No push.

## Scope and sources

Routes `/committees`, `/committees/[committeeId]`, and committee forms/dialogs. Canonical Design System 1.1, interaction/component/verification specs and frontend guidelines; supplied F8 prompt; rough reference (committee area is a placeholder, not a new business contract) and mobile JPEG references; PRD K1/K2/K3; actual router/schema/service, SSR guard and UI tests. UI/UX, design-taste, principles, copy, accessibility, Tailwind/React/Next guidance remain active.

## Implemented

- Scoped readable cards, list/detail spacing and typography, wrapping names/labels/actions, responsive division grids and dialogs. Dialog gutters stay usable at 200% text; control transitions do not animate typography/geometry. Indonesian wording explains unavailable/eligibility states without changing the eligibility flag.
- Explicit paused-network feedback on list/detail and candidate search. Selected members remain in the existing in-memory form state, not browser persistence.
- Existing SSR `canManageCommittee` guard, live server policy, 20-result server list/search pagination, 15-member client paging, minimum two-character candidate search and 20-result search bound are retained.
- K3 selection remains deduplicated and persistent across keywords, capped at 30, with removal and shared division/position. Existing pending locks prevent close/double submit; failed mutation retains selections and assignment; success invalidates only Committee data and refreshes member counts. Ineligible members remain visible/removable while edit is disabled. No new permissions, workflow or audit semantics.

## Verified

- Committee UI + backend contract unit suites: **23 passed / 208 assertions** across two files, synthetic/in-memory fixtures only. Includes guard/capability, selection30, duplicates, invalid assignments, transaction identity recheck, pending, failure retention, success/invalidation and refresh failure behavior.
- Web typecheck passed (empty TypeScript output, exit 0; environment stream-fd warnings only). Focused Biome, architecture check (no exceptions) and diff check passed.
- Isolated production build passed after retrying the existing Next advisory CLI stop; no dependency upgrade.
- Actual Chromium 158.0.8127.18: list/detail at 320/390/768/1024/1440 light/dark; member dialog at all five widths and 200% text/spacing with focused Cancel visible; list search/pagination20, member search/paging15; create validation without mutation; disabled ineligible edit with removal retained; min2/max20 candidate search, cross-keyword selection30 and disabled31st; pending Escape/close blocked; synthetic failed submission retains30 and PIC1; retry succeeds and refreshes46 members. Direct unauthorized member route redirects via server layout. No page errors. Screenshots reviewed from `output/playwright/f8/`; results.json records the checks.

## Limits and impact

No API, dependency, database/migration, identity/committee policy, eligibility, batch size, audit, transaction or environment changes. Browser writes are intercepted synthetic local responses, not real member changes. Real DB authorization/concurrency, real device Safari/Android/Brave, native screen readers, field performance and PM UAT remain unverified. Local fixtures are not release sign-off.
