# Frontend refactor F6 — Profile and own attendance history

Status: implemented and tested locally; PM UAT remains pending. PM authorized continuing sequentially through F11 after local commits and merges, stopping for unresolved product decisions. No push/release authorization.

## Sources and scope

Canonical Design System 1.1, frontend guidelines and linked interaction/component/verification contracts; supplied F6 prompt; rough `ProfilPage` and mobile JPEG references; PRD own attendance and identity rules; actual identity.profile, attendance.ownHistory/reportAttendance DTOs and server policies; DASH-01/DASH-05 integration limits. UI/UX, design-taste, principles, copy, accessibility, Tailwind, React/Next, mobile and minimal-change skills applied. Operational requirements override landing-page examples.

Routes: `/profile`, `/attendance/history`. Public landing/login untouched.

## Implemented

- Profile shows actual actor-specific fields, initials fallback, account status, explicit missing-field placeholders, light/dark preference and the existing password form inside a keyboard-operable disclosure. No fictional online indicator, period, SR code or role selector.
- SR profile links to own attendance history. Approved personal attendance aggregate is explicitly unavailable: the source API/active-term reference is not connected. No 92% mock ring, invented count or aggregation from a paginated history page. SYSTEM_ADMIN has username/account information but no SR statistics, NIM or own-history link.
- Own history preserves source presence, timing classification, late minutes, timestamp and schedule. WIB remains explicit; null timestamps show “Belum tercatat”. QR/manual source and event status are secondary details. No editing or scoring changes. Pagination remains server offset/limit 25 and nextOffset; no global totals inferred.
- Server pages reuse the request-scoped cached session guard; direct SYSTEM_ADMIN history navigation redirects to profile. Existing Express authorization remains authoritative.
- Personal queries use the installed tRPC adapter's supported keyPrefix with session userId and schema namespace v1, retaining the single shared QueryClient. Keys do not add userId to API inputs. Account-specific entries prevent cross-account cache reuse; existing logout clears all queries. No sensitive persistence or new cache client.
- Mount revalidation, loading/empty/error/paused-network states, safe error text and retry. Error states hide cached personal rows. Scoped personal-page CSS handles long words, 320px layout, touch targets and enlarged text without changing shared public styles.

## Verification

- 106 tests passed / 1,172 assertions across personal pages, workflow, dashboard, broadcast and scanner suites. Actual tRPC key tests prove account separation while preserving the original route/input. Personal tests cover SR/system fields, unavailable summary, guarded error/cache behavior, WIB, source classifications and 25-item server paging.
- Typecheck passed; focused Biome, architecture checks (no exceptions), and git diff check passed.
- Isolated Next webpack build passed after the existing CLI advisory retry. Final presentation build and history browser rerun also passed after the check-in label punctuation fix identified in screenshot review.
- Chromium 158.0.8127.18: profile and history both passed 320/390/768/1024/1440 light/dark, 200% text plus spacing, keyboard disclosures, theme persistence, missing profile fields, slow loading/error/retry, unavailable aggregate, real server DTO status/timing fields (synthetic records), correct WIB date/time, absent/pending records without fake timestamps, QR/manual details, pagination and offline page switch/reconnect. Error/forbidden responses hide cached rows; SYSTEM_ADMIN direct history navigation redirects before any history request. No runtime errors or page overflow.
- Evidence and reviewed screenshots: `output/playwright/f6/`, profile-results.json and history-results.json. Local synthetic fixtures only. Final history rerun passed after the punctuation-only fix.

## Limits and impact

No API, database/schema/migration, dependency, auth policy, attendance status/scoring or environment changes. A client cache namespace is added using existing tRPC support; existing module-wide unprefixed invalidations do not target these entries, so personal route mount revalidation remains required. All entries are cleared on existing logout. The later resilience audit must account for both namespaces.

Real devices, Safari/Brave, native screen readers, field performance and PM UAT remain unverified. Browser fixtures exercise local synthetic data only; unit transport/state tests are not live database authorization proof. Next 16.4.3's existing security-advisory CLI stop occurred on initial builds; retries/build status are recorded without performing an unsolicited dependency upgrade. Backend source aggregation/term contracts remain an integration gap, not a fabricated metric.
