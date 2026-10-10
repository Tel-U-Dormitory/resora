# ADR-0003: Event-scoped reusable QR challenge with location and audited manual entry

**Date:** 2026-10-10 | **Status:** Accepted business rules; token protocol/storage Proposed

## Decision

HCO creates/configures attendance events for `SR`, `KADIV` or `ALL_STUDENTS` (includes SR); participant snapshots are generated at publication and reports include all invitees, even without attendance. Current inactive status always blocks authentication/check-in.

HCO selects the geofence center by map pin or latitude/longitude; radius default **20 meters**, configurable separately. Backend validates distance from untrusted/imperfect browser location. GPS failure leads to direct KADIV HCO entry, with mandatory reason, overridable effective time defaulting to server now, immutable creation time and audit of every insertion/correction.

QR has an unpredictable event-bound token, static for a configurable lifetime, default **six hours from activation**, without automatic rotation. HCO displays it on the event page and may revoke before expiration. Reject expired/revoked tokens. QR infrastructure remains reusable by NEED-007 without importing its business logic.

Scan while QR active, including before scheduled start and after scheduled end. Actual server scan time determines `EARLY` before start, `ON_TIME` through start + configured tolerance inclusive (default **15 minutes**), `LATE` afterward. Presence is separate: missing attendance pending until **explicit authorized HCO closure**, then absent; closure invalidates active QR. Scheduled end cannot cut off an active QR.

## Additional confirmed decisions (Phase 2A review)

- Published events allow edits to title/description only; audience and schedule are immutable.
- Authorized HCO closes explicitly, invalidating active QR and reporting all non-attending invitees as ABSENT.
- HCO may explicitly reissue expired/revoked challenges using configured TTL (default six hours); previous challenges remain invalid; no automatic rotation.
- Attendance corrections retain original QR/MANUAL source and append immutable audit.
- **Recommended safeguard, pending final PM confirmation:** freeze center, radius and late tolerance at publication.

These are future NEED-001 rules only; Phase 2A implements identity definitions, not event/QR/attendance tables or features.

## Proposed technical choices (not HCO-approved rules)

The [canonical data model](../modules/need-001/resora-need-001-data-model.md) proposes HMAC-based static redisplay, challenge storage, participant composite keys, attendance unique/composite FK and append-only before/after audit. These are technical proposals awaiting schema review. Authorization, active-account/participant checks, QR/geofence validation and timestamp/classification are server-side; attendance mutation/audit is atomic. GPS alone does not prove presence.

## Open policy

Cancellation/reopening/republication snapshot handling, final approval of center/radius/late-tolerance freeze, GPS accuracy/radius and configurable TTL/grace bounds, manual override limits/now-inactive backdating, lateness-duration basis/rounding and retention remain TBD. Snapshot publication, QR defaults/static behavior, early/after-end scans and direct KADIV manual workflow are confirmed.


**Synchronization (2026-10-10):** updated in place for the explicitly confirmed Phase 1/pnpm and NEED-001 decisions; prior Bun package-manager/local-only DB assumptions and manual request/approval direction are superseded where applicable. Acceptance does not imply implementation.
