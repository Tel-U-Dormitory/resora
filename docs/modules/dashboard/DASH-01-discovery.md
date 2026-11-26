# Dashboard RESORA — discovery & frontend contract

Status: **PM-approved frontend-first scope**. DASH-01–04 deliver the dashboard UI and synthetic JSON fixtures. Visual layout, responsive behavior, components, copy and accessibility follow the [canonical RESORA Design System](../../design-system.md). This document governs approved KPI/data/source/capability behavior; its frontend-first phase does not change backend, database, authentication, or authorization. KPI fixtures are available only in development/test; production shows unavailable states when no authorized source is connected. Existing dashboard sections and their current behavior are retained.

## Requirement sources

- Jira [RSA-33](https://telkomdormitory.atlassian.net/browse/RSA-33) through [RSA-36](https://telkomdormitory.atlassian.net/browse/RSA-36) define the phase backlog and approved KPI/access decisions.
- The Google Sheet [FR Modul Sistem — P1-04 Dashboard RESORA](https://docs.google.com/spreadsheets/d/1oDqX5oEaxT7wscJVUJHIsRL_y6rlSXeiVOiDTx2hr2Y/edit) supplies FR-DASH-001–009. Its generic statements are interpreted under the newer PM decisions recorded in Jira. In particular, FR-DASH-006's source-owned percentage wording is superseded for the dashboard attendance ratio by the approved frontend calculation below.
- `PEDOMAN PEMBUATAN WEBSITE SISTEM PENILAIAN ANGGOTA.pdf` supplies the HCO assessment and attendance domain guidance. It does not define the dashboard denominator for assessment completeness; the frontend does not invent it.

## Approved baseline and metric definitions

| Card | Personal fields | Management fields | Period | Source / frontend rule |
| --- | --- | --- | --- | --- |
| Penilaian | Nilai akhir pribadi; persentase kelengkapan | Rata-rata nilai SR; persentase kelengkapan; jumlah SR sudah/belum dinilai | Periode evaluasi aktif | Penilaian & Analitik (P1-01). No dashboard API is connected. Do not calculate score or completion percentage in the frontend; fixtures supply display values. |
| Kehadiran | Total kegiatan relevan; hadir; tidak hadir; persentase kehadiran | Same aggregate fields for management scope | Periode menjabat aktif | Attendance module. For dashboard preview, FE derives `hadir / total kegiatan relevan * 100` from the fixture counts. Show no percentage for zero total or missing/inconsistent counts. This is a count ratio, not attendance points. |
| Pelanggaran | Card follows the effective source-module permission | Organization summary only for an eligible management preview | TBD from source module | Pelanggaran (P1-03). No dashboard API is connected. Use synthetic data in development/test and unavailable in production. Do not infer fields, verification state, or grouping from the older sheet. |
| Kebersihan Kamar | “Segera hadir”; no number or CTA | Same status | No period | P2-03 is pending; show “Segera hadir” to active SR. |

No global date filter. Each metric owns its displayed period. No assessment denominator, score aggregation, or violation aggregation is invented. Fixture values are illustrative only.

## Access matrix

| Actor / effective permission | Mode shown | Data scope in the dashboard | Detail navigation |
| --- | --- | --- | --- |
| Authenticated SR without management capability | Personal | Own-profile preview only; the fixture is synthetic | Existing Events, own Attendance History, and Scan QR destinations remain. No synthetic metric creates access to real detail. |
| Inti or valid KADEP, including HCO KADEP | Management preview in development/test | Synthetic organization-wide summary across departments | Do not add management detail links until an existing destination enforces the PM's scope. |
| SUPERADMIN | Management preview in development/test | Synthetic organization-wide summary; full access remains governed by existing modules | Existing module routes retain their own server checks. |
| HCO non-KADEP or other roles | Follow existing module permission | No implied management access from fixtures | Expose only existing destinations allowed by the server-derived session. |

`canManageBroadcast` and `isSuperadmin` are server-derived session capabilities used to select the preview mode. They are presentation gates, not security boundaries. Backend authorization remains authoritative. A mode switch never grants access to a module API.

**Detail-route limitation:** the existing `/events/points` page requires `canReadAttendancePoints`; the current policy grants that capability to valid HCO SR and SUPERADMIN, not Inti or KADEP generally. It also does not encode the newly approved KADEP own-department detail scope. No new detail CTA is wired in this frontend-only phase; changing those server rules is explicitly deferred.

## Existing frontend/API inventory

| Area | Existing evidence | DASH-01–04 treatment |
| --- | --- | --- |
| Session and role capability | `apps/web/src/features/identity/server/server-session.ts`; session DTO is consumed by `sr-dashboard.tsx`; policy source is `packages/api/src/modules/identity/identity-policy.ts` | Reuse only. No auth or permission changes. |
| Broadcast | `apps/web/src/features/broadcast/broadcast-feed.tsx` uses `broadcast.latest`; `SrDashboard` already renders `BroadcastFeed` | Preserve existing section and behavior. |
| Events and personal attendance history | `dashboard-activities.tsx` uses existing `attendance.list` and `attendance.ownHistory`; `/attendance/history` and `/events` already exist | Preserve existing summary/navigation. `ownHistory` is paginated and is not treated as an aggregate KPI source. |
| Assessment / violations dashboard summary | No dashboard summary endpoint is connected in the frontend | JSON preview only; production unavailable until a source is approved and connected in a later phase. |
| Management attendance aggregate | Existing event/attendance endpoints do not supply the approved dashboard aggregate contract | JSON preview only; production unavailable until a source is approved and connected in a later phase. |
| Cleanliness | Source feature P2-03 is Pending | “Segera hadir”; no number, navigation CTA, or export. |
| Export | No dashboard export capability is connected | Disabled visual simulation in development/test only; no fake download. Preserve existing Attendance CSV separately. |

## Minimum typed contract and fixture format

The implementation contract is `apps/web/src/features/dashboard/dashboard.contracts.ts`. A metric carries a stable ID, title, scope, period, discriminated UI state, and an optional export capability. The JSON fixtures are:

- `apps/web/src/features/dashboard/fixtures/personal.json`
- `apps/web/src/features/dashboard/fixtures/management.json`
- `apps/web/src/features/dashboard/fixtures/states.json`

The server-only provider imports fixtures only when `NODE_ENV` is `development` or `test`; production returns `null`. Fixture validation happens at the provider boundary. Production KPI fallbacks are unavailable, never fixture data.

Supported visual states: loading skeleton, ready value/summary (including zero), empty, not assessed, missing period, coming soon, unavailable, error, and forbidden. Loading and error are distinct typed states. Metrics load independently from Broadcast and Activities, so a missing KPI source does not hide the rest of the dashboard.

## Navigation, export, and state behavior

- Personal attendance history links to its existing authorized history page; event cards use existing event routes when they represent real source data. Synthetic cards do not link to real detail routes.
- Management overview shows the approved all-department scope label and per-card period. It does not include member rows or unapproved sensitive fields.
- Export controls are disabled visual placeholders in the synthetic preview. Production requires a real server-derived export capability; no capability or download is created here.
- `ready: 0`, empty, not assessed, missing period, unavailable, error, and forbidden remain distinct.
- KPI counts/summary are fixtures only in development/test. No fixture fallback is used after a production request fails.

## Deferred items and acceptance boundary

Deferred until a later API/backend phase: assessment and violation dashboard sources; authorized management attendance aggregate/detail route (including Inti cross-department and KADEP own-department checks); export capability and delivery; backend revocation/cache-invalidation and cross-department negative authorization tests. These are not claimed as implemented by the frontend prototype.

Frontend completion evidence is the typed contract, JSON preview fixtures, gated mode selection, production-unavailable state, existing dashboard behavior, UI state handling, and focused frontend verification. No backend file, schema, permission, or authentication change is in scope.
