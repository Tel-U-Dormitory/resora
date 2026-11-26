# Dashboard RESORA — DASH-04–08 delivery

Date: 2026-11-26. Branch: `feat/dashboard-resora`.

## Delivered

- DASH-04: gated personal/management preview personas, organization scope labels, per-card periods, no duplicate KPI cards; management fixture is isolated to the development/test preview route.
- DASH-05: typed async JSON transport with loading, ready/zero, empty, missing-period, not-assessed, unavailable, forbidden, and transport-error states. Independent requests fail without replacing data with dummy success.
- DASH-06: preview activities and broadcasts use time/status-filtered JSON fixtures; real dashboard event, attendance, broadcast, and QR behavior remains available outside preview.
- DASH-07: session identity remounting, mode/capability checks, safe cancellation, production fixture exclusion, and distinct unavailable/error states.
- DASH-08: development-only management export simulation for the approved assessment, attendance, and violation samples as XLSX/PDF. Export validates mode, scope, period, capability, current metric state and fixture snapshot. It downloads watermarked synthetic files; production capability and real export remain absent.

Implementation: `apps/web/src/features/dashboard/` and isolated route `apps/web/src/app/dashboard-preview/`. No backend, authentication, permission, database, or schema changes. The automated route is not a real-user permission test.

## Verification evidence

- Focused dashboard lint: passed.
- `pnpm exec bun test apps/web/src/features/dashboard`: 28 passed.
- `pnpm --filter web run check-types`: passed.
- Local browser: management/personal switching, state failures/retries, theme, 320/375/390/768/1024/1440px widths, and synthetic XLSX/PDF download/denial/cancel verified.
- Production build compiled, typechecked, and generated routes including `/dashboard-preview`; Next.js then stopped the command with `SecurityFatalError` for the installed Next.js version. Final build exit: 1.
- `pnpm run lint` blocked by 9 pre-existing errors in the rough design reference TSX and 395 warnings across the repository; changed dashboard paths pass focused lint.
- `pnpm run test:offline` did not complete cleanly: two unrelated deploy/server tests timed out or failed their state assertions under the 5-second harness. Load-test suite: 35 passed.
- Browser widths were checked in the local browser DOM; physical devices, native screen readers, and manual UAT remain unverified.

## Remaining integration decisions

- Real assessment and management attendance aggregates, active-term source, detail routes, production export capability/audit/authorization, and final sensitive export fields must come from their owning backend modules and PM-approved contracts.
- Current synthetic export fields are illustrative only. No real data or authorization is implied. Preserve attendance CSV behavior.
- Jira acceptance parity could not be independently verified from the connected Jira instance; the approved consolidated dashboard prompt and later PM decisions were used.
