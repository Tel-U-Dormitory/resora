# ADR-0003: Session-bound reusable QR challenge with location and audited manual entry

**Date:** 2026-10-10 | **Status:** Accepted roster/session behavior; Phase 4 internal-event ownership/session binding and signing implemented; future Activity binding deferred

## Decision

HCO creates internal SR events with composable selection of all active SR, one/multiple departments, all KADEP across departments and individuals, plus manual include/exclude and deduplication. Inti selects department INTI; Inti + KADEP unions INTI with all non-INTI KADEP; exclusions win. Preview uses current active SR; publish atomically saves immutable `(event_id, user_id)` invitation snapshots, and reports include all invitees. Later assignment changes do not rewrite the snapshot; live inactive status still blocks authentication/check-in. A single audience enum is superseded as the primary model.

HCO selects the geofence center by map pin or latitude/longitude; radius default **20 meters**, configurable separately. Backend validates distance from untrusted/imperfect browser location. GPS failure leads to direct KADEP HCO entry, with mandatory reason, overridable effective time defaulting to server now, immutable creation time and audit of every insertion/correction.

NEED-001 has one attendance session per event, separate from publication and schedule. QR references that session with an unpredictable session-bound token and validated event/context association, static for a configurable lifetime, default **six hours from activation**, without automatic rotation. HCO displays it on the event page and may revoke before expiration. Reject expired/revoked tokens. QR infrastructure remains reusable by NEED-007 without importing its business logic.

Scan only while attendance session and current QR are active/valid, including before internal scheduled start and after scheduled end. Actual server scan time determines `EARLY` before start, `ON_TIME` through start + configured tolerance inclusive (default **15 minutes**), `LATE` afterward. Presence is separate: missing attendance pending until **explicit authorized HCO closure**, then absent; event closure atomically closes its session and invalidates active QR. QR expiry/revocation and scheduled end do not close event/session automatically. NEED-001 has no standalone close-session API/UI; event close handles INACTIVE or ACTIVE sessions.

## Additional confirmed decisions (Phase 2A review)

- Published events allow edits to title/description only; audience and schedule are immutable.
- Authorized HCO closes explicitly, invalidating active QR and reporting all non-attending invitees as ABSENT.
- HCO may explicitly reissue expired/revoked challenges using configured TTL (default six hours); previous challenges remain invalid; no automatic rotation.
- Attendance corrections retain original QR/MANUAL source and append immutable audit.
- **Recommended safeguard, pending final PM confirmation:** freeze center, radius and late tolerance at publication.

These are future NEED-001 rules only; Phase 2A implements identity definitions, not event/QR/attendance tables or features.

## Proposed technical choices (not HCO-approved rules)

The [canonical data model](../modules/need-001/resora-need-001-data-model.md) proposes HMAC-based static redisplay, session-bound challenge storage/current-challenge uniqueness, participant composite keys, attendance unique `(session_id, user_id)` and append-only before/after audit. No universal attendance FK to invitation snapshots is proposed: internal entitlement uses the published snapshot; general entitlement uses Activity's public backend registration interface. These are technical proposals awaiting schema review. Authorization, active-account/participant checks, QR/geofence validation and timestamp/classification are server-side; attendance mutation/audit is atomic. GPS alone does not prove presence.

## Open policy (historical; superseded where decided by Phase 4/5 below)

Physical session/event/context binding and event ownership across modules, one-internal-session publication integrity, independent session-close reporting/manual lifecycle, cancellation/reopening/republication snapshot handling, final approval of center/radius/late-tolerance freeze, GPS accuracy/radius and configurable TTL/grace bounds, manual override limits/now-inactive backdating, lateness-duration basis/rounding and retention remain TBD. Snapshot publication, QR defaults/static behavior, early/after-end scans and direct KADEP manual workflow are confirmed.


**Synchronization (2026-10-10):** updated in place for the explicitly confirmed Phase 1/pnpm and NEED-001 decisions; prior Bun package-manager/local-only DB assumptions and manual request/approval direction are superseded where applicable. Acceptance does not imply implementation.

**Phase 3 PM update (2026-10-11):** active jabatan/audience terminology uses KADEP, replacing KADIV without an input alias or automatic legacy conversion. See [canonical organization/policy baseline](../modules/need-001/resora-need-001-data-model.md#8-server-side-authorization-phase-3). Event/attendance implementation and reconciliation with the current roster/session PRD remain later work.

**Documentation synchronization (2026-10-11, after Phase 3):** active sections now use the roster/session baseline. Earlier Phase 2A/3 dated notes remain historical. No event/attendance code or migration is implemented. Event/context reference architecture requires review before Phase 4; tRPC remains the frontend/backend entry point, public backend interfaces connect domains, and authorization stays domain-owned.

## Phase 4 FINAL implementation decision (2026-10-11)

This decision supersedes the earlier proposed/open items for internal event ownership, INTI, policy freeze, session creation and signing. Attendance owns internal events, snapshots, sessions and QR. `attendance_sessions.internal_event_id` is UNIQUE NOT NULL FK; create both atomically, enforce inverse cardinality with deferred triggers, forbid rebinding. Publish atomically resolves the Identity public directory and saves snapshots without activating session. Freeze roster, schedule and all session configuration; only title/description remain editable. HCO explicitly activates and closes via event; close updates event/session/QR together. No cancel/reopen/republish or standalone close-session endpoint.

QR uses random challenge UUID plus session-bound HMAC-SHA256; HKDF derives a domain-separated key from backend Better Auth secret. No raw token is persisted. Authorized HCO receives a stable PNG on demand; current challenge has a partial UNIQUE index. Event/session row locks serialize activation/revoke/reissue/close. Secret rotation invalidates signatures. Backend public verification checks QR/session/parent state; Phase 5 must add live identity, invitation and GPS checks. Future Activity parent binding and registration consistency remain deferred; no generic registry or polymorphic references. Four-table additive migration is locally validated only; remote application requires separate PM approval.

## Phase 5 PM decision (2026-10-12)

This supersedes earlier open accuracy/privacy proposals: radius defaults to 20 m and freezes at publish; initial maximum GPS accuracy is 20 m through one backend constant. Browser submits signed QR token plus latitude, longitude and accuracy only. Backend validates untrusted numeric inputs and Haversine distance, current session/challenge, active valid SR and invitation under the lifecycle transaction. Only successful QR attendance stores one DOUBLE PRECISION location/accuracy package; MANUAL GPS is NULL. No continuous tracking or failed-location history. General responses, recaps and exports omit raw GPS; dedicated audit authorization and retention require decisions before Production/real pilot. Explain storage before GPS permission. Valid duplicates return the original result only after all validity checks. Phase 5 adds attendance_records only; manual/audit/report and Activity remain later phases.

## Phase 6 PM final decision (2026-10-12)

PM applied `20261012032606_phase5_checkin` to Supabase Development. Read-only verification matched all five migration hashes, columns, indexes, constraints and enabled triggers. Eighteen distinct targeted PostgreSQL cases passed, including parallel duplicate, close, revoke/reissue and SQL origin/constraint checks. Twelve isolated fixture events were cleaned with existing data unchanged. Live inactive/invalid-assignment DB-profile reload remains unverified (service-context rejection tested); mobile HTTPS UAT is pending. This supersedes earlier unapplied/unverified status, preserving historical evidence.

KADEP HCO alone may insert/correct/audit attendance on PUBLISHED with INACTIVE/ACTIVE session or CLOSED/CLOSED, never DRAFT. Effective time must be <= server now and, for CLOSED, <= events.closed_at; CLOSED insertion requires explicit time. No scheduled-end cutoff or extra backdate window. Existing records of inactive historical invitees may be corrected, but new inactive/ineligible insertion is denied. Preserve original recorded_at, source, recorded_by_user_id, initial manual_reason and GPS; update only attendance_at/timing_class/updated_at and append mandatory-reason before/after audit atomically. Manual operations cannot reopen event/session/QR or change snapshots/frozen policy.

HCO recap/CSV starts from every invitation snapshot LEFT JOIN records by session/user. Presence is derived PRESENT/PENDING/ABSENT, with missing time/timing/source/duration NULL. Lateness is max(0, ceil(minutes after grace)), zero for EARLY/ON_TIME. Own history is session-user-only with bounded pagination, no arbitrary userId. UTF-8 CSV uses quoting/formula defense, an apostrophe text marker retaining NIM leading zeros without formulas, WIB timestamps and blank missing fields. No raw GPS, credentials or internal audit JSON. GPS/audit/export retention and export-access audit remain release decisions.

New audit migration provides append-only/binding/JSON guards and extends immutable origin. Applied files unchanged; event → session → record lock order retained, record and audit transactional. Phase 6 migration `20261012071912_phase6_reporting` was applied with separate PM approval to verified Supabase Development using Session Pooler 5432 and verified TLS. History contains six matching migrations, no pending migration. Seventeen real PostgreSQL test groups passed (12 rollback-based, five committed concurrency cases), including audit guards, rollback on audit failure, manual/QR uniqueness, correction chain and concurrent close. Six temporary events rolled back completely; one explicitly approved concurrency fixture remains CLOSED with two records/four immutable audits. Data outside the fixture was unchanged. Live inactive-target/historical-inactive and additional role combinations remain unverified; Phase 7 does not mutate remote identities or repeat those suites.
