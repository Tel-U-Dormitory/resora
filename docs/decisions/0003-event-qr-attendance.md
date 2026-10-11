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

## Open policy

Physical session/event/context binding and event ownership across modules, one-internal-session publication integrity, independent session-close reporting/manual lifecycle, cancellation/reopening/republication snapshot handling, final approval of center/radius/late-tolerance freeze, GPS accuracy/radius and configurable TTL/grace bounds, manual override limits/now-inactive backdating, lateness-duration basis/rounding and retention remain TBD. Snapshot publication, QR defaults/static behavior, early/after-end scans and direct KADEP manual workflow are confirmed.


**Synchronization (2026-10-10):** updated in place for the explicitly confirmed Phase 1/pnpm and NEED-001 decisions; prior Bun package-manager/local-only DB assumptions and manual request/approval direction are superseded where applicable. Acceptance does not imply implementation.

**Phase 3 PM update (2026-10-11):** active jabatan/audience terminology uses KADEP, replacing KADIV without an input alias or automatic legacy conversion. See [canonical organization/policy baseline](../modules/need-001/resora-need-001-data-model.md#8-server-side-authorization-phase-3). Event/attendance implementation and reconciliation with the current roster/session PRD remain later work.

**Documentation synchronization (2026-10-11, after Phase 3):** active sections now use the roster/session baseline. Earlier Phase 2A/3 dated notes remain historical. No event/attendance code or migration is implemented. Event/context reference architecture requires review before Phase 4; tRPC remains the frontend/backend entry point, public backend interfaces connect domains, and authorization stays domain-owned.

## Phase 4 FINAL implementation decision (2026-10-11)

This decision supersedes the earlier proposed/open items for internal event ownership, INTI, policy freeze, session creation and signing. Attendance owns internal events, snapshots, sessions and QR. `attendance_sessions.internal_event_id` is UNIQUE NOT NULL FK; create both atomically, enforce inverse cardinality with deferred triggers, forbid rebinding. Publish atomically resolves the Identity public directory and saves snapshots without activating session. Freeze roster, schedule and all session configuration; only title/description remain editable. HCO explicitly activates and closes via event; close updates event/session/QR together. No cancel/reopen/republish or standalone close-session endpoint.

QR uses random challenge UUID plus session-bound HMAC-SHA256; HKDF derives a domain-separated key from backend Better Auth secret. No raw token is persisted. Authorized HCO receives a stable PNG on demand; current challenge has a partial UNIQUE index. Event/session row locks serialize activation/revoke/reissue/close. Secret rotation invalidates signatures. Backend public verification checks QR/session/parent state; Phase 5 must add live identity, invitation and GPS checks. Future Activity parent binding and registration consistency remain deferred; no generic registry or polymorphic references. Four-table additive migration is locally validated only; remote application requires separate PM approval.
