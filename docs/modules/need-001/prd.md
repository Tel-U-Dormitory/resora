# PRD — NEED-001 · SR Internal Event Attendance

**Product:** RESORA (working title) | **Module:** `NEED-001`, `MOD-03` (Attendance)  
**Version:** 0.2 synchronized draft | **Updated:** 2026-10-10\
**Pilot deadline:** **2026-10-18** (usable by actual SR; not a wireframe)  
**PM:** final PRD/UAT/release approval | **Policy validator:** HCO  
**Status:** CONFIRMED business baseline; proposed schema/technical choices and remaining TBDs require review. No implementation or UAT completion is claimed.

## 1. Business goal

Digital attendance for **SR internal activities/events** (e.g., internal meetings). HCO creates the **event** and attached QR; participants authenticate as SR and record attendance in a controlled time/location window. The QR infrastructure must be reusable in later NEED-007 but event registration and character points are not part of NEED-001.

### Definition of success for pilot

By Oct 18, authorized HCO can create an event and use a QR, eligible SR can mark attendance on mobile and see their history, HCO can review/export all invited participants, including non-attendees, and KADIV HCO can insert/correct manual attendance with a mandatory reason and audit history. Must be backed by production-ready permission checks and UAT—not mocked data alone.

## 2. Actors and audience are separate concepts

| Entity / filter                            | Meaning                                                 | Used by                                                    |
| ------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------------------- |
| `actor = SR`                               | Primary account actor, exclusive of `MAHASISWA`         | Initial pilot login                                        |
| `actor = MAHASISWA`                        | General student primary account actor                   | Future login scope                                         |
| `sr.department = HCO`                      | SR member of HCO department                             | Event create/list/export                                   |
| `sr.position = KADIV` + `department = HCO` | KADIV HCO                                               | Insert/correct manual attendance with reason and audit         |
| `audience = SR`                            | Any active SR account                                   | Event eligibility                                          |
| `audience = KADIV`                         | Any active SR with `position=KADIV`, **any department** | Event eligibility                                          |
| `audience = ALL_STUDENTS`                  | `MAHASISWA` **or** `SR`                                 | Future general student events; initial pilot login SR-only |

The same SR **belongs to exactly one primary actor** but may match several event audiences (`SR`, `ALL_STUDENTS`, and `KADIV` if appointed). Each event selects a supported audience predicate; multi-audience selection is not a confirmed requirement. Generate its participant snapshot at publication. Later assignment changes do not silently rewrite invitations or historical reports; current inactive status always blocks authentication/check-in.

**Pilot caveat:** The system may store audience `ALL_STUDENTS`, but student (non-SR) sign-in is not yet supported. UI must signal this limitation; do not claim full general-student events function until that actor is enabled.

## 3. Roles and permissions

| Action | SR (non-HCO) | SR HCO member | SR KADIV HCO |
| --- | --- | --- | --- |
| View own invited events and attendance history | Yes | Yes | Yes |
| Check in to invited event while active | Yes | Yes | Yes |
| Create/configure/publish attendance event | No | Yes | Yes |
| Activate/display/revoke event QR | No | Yes | Yes |
| View/export all invited participants' attendance | No | Yes | Yes |
| Insert manual attendance | No | No | **Yes**, reason + audit |
| Correct recorded attendance | No | No | **Yes**, reason + audit |

Initial superadmin has system-level privileges, **not** a fifth primary actor. Initially only superadmin may change SR department, position, building and active status. System privileges do not implicitly replace HCO/KADIV attendance checks. Enforce all permissions server-side; no routine destructive attendance overwrite/deletion.

## 4. Event configuration — functional baseline

| Field | Rule / status |
| --- | --- |
| Title / description | Required title; optional description (proposed storage) |
| Scheduled start/end | Ordered instants; display Asia/Jakarta; these are not QR scan cutoffs |
| Audience | `SR`, `KADIV`, `ALL_STUDENTS`, selected by HCO |
| Geofence center | HCO map pin or latitude/longitude; coordinate center separate from radius |
| Geofence radius | Default **20 meters**, configurable; permitted range **TBD** after field testing |
| Late tolerance | Default **15 minutes**, configurable per event |
| QR lifetime | Default **six hours from activation**, configurable per event; static, no automatic rotation |
| Lifecycle storage | Draft/published/closed/cancelled state names and edit/closure rules are **PROPOSED/TBD** |

**CONFIRMED timing:** check-in is permitted while the QR is active, including before scheduled start and after scheduled end. `EARLY` means `attendance_at < starts_at`; `ON_TIME` means `starts_at <= attendance_at <= starts_at + late tolerance`; `LATE` means afterward. QR scans use actual server time. Event end must not automatically reject a scan while QR remains active.

**Presence is separate:** an attendance record means `PRESENT`; an invitee without one is `PENDING`/not yet present until the attendance window closes, then `ABSENT`. Attendance-window closure and QR reissue semantics remain **TBD**; do not infer closure merely from scheduled end.

## 5. End-to-end workflows

### 5.1 HCO creates and publishes an event

1. Backend validates active SR session and HCO department.
2. HCO selects title, schedule, audience, map pin/latitude-longitude center, radius, late tolerance and QR lifetime.
3. Backend validates inputs and permissions. Publication generates the invited participant snapshot atomically with publication state.
4. HCO activates an unpredictable event-bound QR and displays it directly on the event page. Default expiry is activation + six hours; no automatic rotation. Authorized HCO may revoke before expiry.
5. Event access/check-in uses the publication snapshot plus current account active status. Reports retain all invitees after assignment changes or non-attendance. Explicit QR reissue/edit/resnapshot policy remains TBD.

### 5.2 SR attendance via QR

1. Active provisioned SR signs in with NIM/password and opens the scanner; browser requests location permission.
2. QR carries an unpredictable event-bound token, static during its configured lifetime; no user privileges or signing secrets.
3. Backend validates session, SR actor, current active status, invitation snapshot, token activation/expiry/revocation and uniqueness. Early and after-end scans remain valid while QR is active.
4. Backend validates coordinate inputs and distance in meters from event center. GPS accuracy is imperfect and client location untrusted; accuracy threshold remains TBD after field testing.
5. Use actual server attendance time, compute timing classification, and atomically insert one attendance per event/user. Duplicate/retry/concurrent submissions cannot change the original timestamp or create another row.
6. SR sees own result/history; HCO reports all invitees. QR sharing and GPS spoofing remain risks; event binding, authentication, QR validity and backend policy are mandatory.

### 5.3 Manual attendance fallback

When GPS cannot verify attendance, direct the participant to KADIV HCO for manual entry. The pilot has no SR-submitted request/approval workflow.

1. KADIV HCO opens an event.
2. Searches its invited participants by name or NIM and selects a participant profile.
3. Enters manual attendance with a **mandatory reason**.
4. Effective `attendance_at` defaults to current server time; KADIV may override it to represent actual attendance.
5. Backend automatically computes `EARLY`/`ON_TIME`/`LATE` from effective time and event policy.
6. Persist effective time separately from immutable `recorded_at` (actual creation time), acting user and append-only audit history.
7. Attendance mutation and audit insertion are atomic; unique `(event_id, user_id)` prevents duplicate manual/QR records.

Allowed effective-time override bounds and handling of backdated manual entry for a now-inactive participant remain **TBD**. Inactive users themselves cannot authenticate/check in.

### 5.4 Attendance correction

Only KADIV HCO may correct recorded attendance, requiring reason and immutable before/after audit in the same transaction. Recalculate timing automatically from corrected effective time; preserve original `recorded_at`. If a record exists, offer correction instead of a second insertion. No routine hard-delete or unaudited overwrite.

### 5.5 Authentication and provisioning (Phase 2)

- Better Auth Username Plugin with NIM/password; SR-only pilot login; no public self-registration, including direct endpoint calls.
- Every SR has a real email. Authorized CSV import supplies **NIM, name, email, department, position, building and active status**; technical header mapping is in the canonical data model.
- PM uploads real CSV privately before pilot UAT. Use synthetic accounts until then; no real student data or credentials in Git.
- Securely generate/distribute initial credentials and require password change. Better Auth manages password hashing.
- Plan backend Gmail SMTP with display name **RnD SR XIV**. Sender address and SMTP credentials remain environment variables. Password recovery and email verification belong to Phase 2; they are not current scaffold functionality.

### 5.6 Attendance reporting and export

HCO reports/exports start from **all invited participants**, including missing attendance records. CSV is required; XLSX optional. Include NIM/name, department/position/building as appropriate, presence (present/absent after closure; pending before closure), effective attendance timestamp, timing class, lateness duration and `QR`/`MANUAL` source where relevant. Missing records have no fabricated timestamp, timing or source. Exclude passwords, session tokens, QR secrets and raw GPS coordinates. Lateness-duration basis/rounding, filters and retention remain TBD.

## 6. Main FR candidates (new NEED-001 IDs are provisional)

The historic workbook does not contain dedicated QR-scan FRs for NEED-001. **Never map FR-044..047 to this module; they describe QR attendance for NEED-007 activities.** `FR-086` is an internal attendance _recap_ fragment, not the scan workflow. Assign canonical FR IDs in `03_FR Master` after approval.

| ID         | Candidate requirement                                                      | State                                             |
| ---------- | -------------------------------------------------------------------------- | ------------------------------------------------- |
| N001-FR-01 | SR can authenticate via NIM/password; no public sign-up                    | Confirmed direction; login implementation pending |
| N001-FR-02 | HCO can create event with audience, time, location, radius, grace period   | Confirmed main fields                             |
| N001-FR-03 | HCO displays/revokes static event QR, default 6h from activation, configurable   | Confirmed; token protocol proposed                         |
| N001-FR-04 | Eligible authenticated SR can check in to event via QR                     | Confirmed                                         |
| N001-FR-05 | Server checks invitation, active status, QR validity, duplicates and geofence     | Confirmed checks; GPS threshold/radius bounds TBD   |
| N001-FR-06 | Presence separate from EARLY/ON_TIME/LATE; 15-min default grace inclusive | Confirmed; attendance-window closure TBD    |
| N001-FR-07 | KADIV HCO searches/selects participant and inserts manual attendance/reason                    | Confirmed                                         |
| N001-FR-08 | Effective/recorded time distinct; automatic class; insert/correction audited      | Confirmed                                         |
| N001-FR-09 | HCO reports/exports every invitee, including non-attendees; required CSV                              | Confirmed                                         |
| N001-FR-10 | SR can view own eligible/attended event history                            | Confirmed                                         |

## 7. Data model candidates (NOT a final ERD)

The [canonical NEED-001 data model](resora-need-001-data-model.md) owns the proposed ERD, columns, defaults, PK/FK relationships, constraints, indexes, snapshots and audit design. Do not duplicate those table definitions here.

**Implemented baseline:** `packages/db/src/schema/auth.ts` currently contains only Better Auth `user`, `session`, `account`, `verification`; Username Plugin fields and all NEED-001 domain tables are pending. The data model's [repository compatibility review](resora-need-001-data-model.md#12-repository-compatibility-review-2026-10-10) records discrepancies and suggested corrections. Review before future schema generation/migrations; this documentation update changes no schema or database.

## 8. Proposed tRPC procedures (contract sketch)

This is a **design guide**, not a guarantee about generated router names.

| Procedure                       | Auth rule                                 | Result                               |
| ------------------------------- | ----------------------------------------- | ------------------------------------ |
| `attendanceEvents.create`       | `SR + department HCO`                     | Create draft event                   |
| `attendanceEvents.update`       | HCO, policy on edits after attendance TBD | Update permitted event fields        |
| `attendanceEvents.listEligible` | active SR                                 | Eligible events only                 |
| `attendanceEvents.get`          | HCO or eligible SR                        | Audience-scoped event details        |
| `attendanceQr.issue`            | HCO                                       | Static event-bound QR with configured lifetime |
| `attendanceQr.scan`             | active eligible SR                        | Check-in or safe duplicate rejection |
| `attendance.mine`               | logged-in SR                              | Only own attendance/event history    |
| `attendance.byEvent`            | HCO                                       | Filtered recap                       |
| `attendance.exportByEvent`      | HCO                                       | Authenticated, auditable export      |
| `attendanceEvents.publish`     | HCO                                       | Atomic publication + participant snapshot |
| `attendanceQr.revoke`           | HCO                                       | Immediate QR invalidation            |
| `attendanceManual.create`       | KADIV HCO                                 | Effective time, mandatory reason, audit |
| `attendance.correct`            | KADIV HCO                                 | Audited correction                   |

Use Zod to validate payloads and recompute all authorization and attendance rules on backend. Client data is untrusted.

## 9. UI screens (minimum)

1. Login NIM/password, initial password change flow, session-expired state.
2. SR event list and event details showing eligibility/status and own attendance history.
3. QR scan/check-in screen with permission prompt, location/accuracy feedback, duplicate status, contact KADIV HCO for manual entry.
4. HCO create/edit event, QR display, event recap/export view.
5. KADIV HCO event participant search/profile, manual entry with reason/effective time, correction audit history.
6. Mobile friendly states: empty, error, loading, expired QR, poor GPS, blocked permissions and session expiry.

## 10. Pilot quality and security

- Geolocation API requires secure context in production (HTTPS). Browser precision can exceed chosen 20 m radius; a manual path is mandatory.
- QR validity: configured expiry/revocation, server verification, event binding; QR is **not** a credential/attendance proof by itself.
- Atomic uniqueness for event/user attendance with well-defined idempotency and duplicate UI response.
- Explicit server-side authorization for HCO/KADIV; audit manual insertions/corrections and export accesses where appropriate.
- Never ship seeded real NIM/password data, print initial credentials to logs, or expose bulk user import endpoints publicly.
- Structured logs redact secrets, QR tokens, GPS-sensitive data.

## 11. Risks / blocked decisions before PM sign-off

| Key | Remaining item | Owner | Gate |
| --- | --- | --- | --- |
| OPEN-001 | Attendance-window closure/absence trigger; explicit QR reissue after expiry/revocation | HCO + PM | Before reporting/QR lifecycle implementation |
| OPEN-002 | Publish/edit/cancel/republish policy and snapshot refresh/versioning | HCO + PM | Before event lifecycle implementation |
| OPEN-003 | Permitted radius range, GPS accuracy threshold and configurable TTL/grace bounds | HCO + PM | Before validation/field UAT |
| OPEN-004 | Manual effective-time bounds; backdated entry for now-inactive participants | KADIV HCO + PM | Before manual implementation |
| OPEN-005 | Actual roster/building/position values and secure credential delivery | PM + RnD | Before real import/UAT |
| OPEN-006 | Gmail sender address/credentials, recovery/verification delivery policy | PM + RnD | Phase 2 verification |
| OPEN-007 | Lateness-duration basis/rounding, export filters/logging and retention | HCO + PM | Before reports/release |
| INFRA-001 | VPS/domain/TLS, funding, backups and operational targets | PM + DevOps | Before deployment |

The audience/snapshot rule, static six-hour QR default, early/after-end scanning, inclusive timing boundary, real emails/CSV columns and direct KADIV manual workflow are **CONFIRMED**, not open policy.

## 12. Acceptance, UAT & release gate

[Acceptance tests](acceptance-tests.md) are the checklist; the [roadmap](roadmap.md) sequences implementation. Do not mark the pilot as accepted merely because the pages render. PM signs off after HCO validates business policy, credentials are distributed securely, and real SR users finish mobile tests with QR/GPS/manual correction.

**Technical baseline:** pnpm **10.33.4** package management, Bun **1.3.13** Express runtime, Next.js/tRPC, Better Auth, Drizzle and Varlock. Supabase PostgreSQL is accessed through Express only; runtime `DATABASE_URL` uses Session Pooler, migration tooling prefers `DIRECT_DB_URL` with explicit failures/alternatives. Optional local Docker PostgreSQL and planned VPS hosting remain. See [architecture](../../architecture.md), [setup](../../setup.md) and [pnpm verification](../../pnpm-migration.md).
