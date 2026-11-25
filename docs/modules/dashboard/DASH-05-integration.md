# DASH-05 — source integration readiness

Inspection date: 2026-11-26 (Asia/Jakarta). Branch: `feat/dashboard-resora`.
Base: `b7d5718` (`origin/dev` at inspection). Existing dashboard worktree was
fast-forwarded from `dcf2461`; no backend implementation was edited.

Status: **PARTIAL / integration BLOCKED**. This is an inspection deliverable,
not a claim that either KPI has been integrated. No new adapter is introduced
before the missing inputs are available.

## DASH-04 gate

The frontend prototype is available for PM review: organization-scoped management
fixtures, assessment/attendance/violation summaries, per-card periods, synthetic
preview warning, disabled export simulation, and production unavailable states.
`dashboard-fixtures.test.ts` covers the capability presentation gate and excludes
management fixtures for sessions without it. This does not prove backend
cross-department authorization, revocation, account switching, or visual UAT.
Those acceptance conditions remain unverified/HOLD; DASH-04 is not certified as
fully complete against all integration acceptance criteria.

## Source mapping

| Source | Actual contract and evidence | Dashboard treatment |
| --- | --- | --- |
| Assessment | No assessment router is registered in `packages/api/src/routers/index.ts`. No own-score or authorized management aggregate source was found. | Existing JSON preview only in development/test; production unavailable. Score, completion, assessed/unassessed counts cannot be integrated yet. |
| Violations | `violations.statistics`, registered by `packages/api/src/modules/violations/violations.router.ts`. Input in `violations.contracts.ts:126`: required inclusive calendar dates `dateFrom` / `dateTo`, optional `buildingId`. | Endpoint exists in dev, but activation is HOLD until a legitimate active-term date source is available. Never use fixture dates, the current year, or a fetched list page as a substitute. |
| Violations total | `violations.service.ts:795` returns `totalActive`, `byBuilding`, `trend`, `appliedFilters`; excludes `deletedAt` and filters `incidentDate` inside a repeatable-read transaction. | Future mapping: `totalActive` to total active reports, `byBuilding[].buildingName/count` to reporter-building summaries. Copy owner aggregates; do not recompute from paginated reports. Do not add trend or verification KPIs. |
| Active term | `identity.session` (`identity.router.ts:151`) and `identity.profile` expose no active-term date bounds. `identity.listPeriods` is SUPERADMIN-only (`accounts/account-period.ts:21–42`) and lists periods without selecting the dashboard active term. | Do not call administrative period APIs for ordinary SR or infer which term to use. Source owner must supply an authorized active-term reference/date contract. |
| Detail navigation | No assessment or violations route exists under `apps/web/src/app` in this base. | No KPI detail CTA is fabricated. Existing Events/Attendance/Scan QR are retained. |

Violations policy (`violations-policy.ts`) permits active operational SR and
privileged SUPERADMIN to read reports. Its service rechecks live identity in the
transaction. Personal dashboard mode must not relabel this as a count of the
viewer's own reports or their own violations. This is source inspection, not an
executed API authorization or soft-delete integration test.

## Required owner inputs / gates

1. Assessment owner: approved own-score and management-summary DTOs, evaluation
   period, permission/scope, completeness definition, and existing detail route.
2. Identity/source owner: an authorized active-term date/reference contract for
   the dashboard's eligible actors. No backend/auth change is made here.
3. Violations frontend owner: detail route when available; sensitive detail
   fields remain outside the dashboard summary.
4. Integration verification: compare totals with an authorized dataset for the
   same term, confirm soft-delete exclusion through the real API, and exercise
   401/403, revocation, account switching and independent source failures.
5. Jira: RSA-36/37/13/26 could not be read. TWG has no login profile for
   `telkomdormitory.atlassian.net` (`AUTH_PROFILE_MISSING`). Requirements here use
   the PM's consolidated phase prompt; Jira acceptance parity is unverified.

Existing fixtures remain development/test-only through the server provider.
Production continues to show unavailable KPIs; no request failure falls back to
synthetic data. No database, authorization, infrastructure or export behavior
was changed. No production API/database was queried.
