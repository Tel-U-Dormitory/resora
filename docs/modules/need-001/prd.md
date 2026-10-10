# PRD — NEED-001 · SR Internal Event Attendance

**Product:** RESORA (working title) | **Module:** `NEED-001`, `MOD-03` (Attendance)  
**Version:** 0.1 working draft | **Updated:** 2026-10-10  
**Pilot deadline:** **2026-10-18** (usable by actual SR; not a wireframe)  
**PM:** final PRD/UAT/release approval | **Policy validator:** HCO  
**Status:** PARTIALLY CONFIRMED — list of policy gates below must be signed off.

## 1. Business goal
Digital attendance for **SR internal activities/events** (e.g., internal meetings). HCO creates the **event** and attached QR; participants authenticate as SR and record attendance in a controlled time/location window. The QR infrastructure must be reusable in later NEED-007 but event registration and character points are not part of NEED-001.

### Definition of success for pilot
By Oct 18, authorized HCO can create an event and use a QR, eligible SR can mark attendance on mobile and see their history, HCO can review/export records, and KADIV HCO can decide manual fallback/correction requests. Must be backed by production-ready permission checks and UAT—not mocked data alone.

## 2. Actors and audience are separate concepts
| Entity / filter | Meaning | Used by |
|---|---|---|
| `actor = SR` | Primary account actor, exclusive of `MAHASISWA` | Initial pilot login |
| `actor = MAHASISWA` | General student primary account actor | Future login scope |
| `sr.department = HCO` | SR member of HCO department | Event create/list/export |
| `sr.position = KADIV` + `department = HCO` | KADIV HCO | Correct attendance, approve/reject manual requests |
| `audience = SR` | Any active SR account | Event eligibility |
| `audience = KADIV` | Any active SR with `position=KADIV`, **any department** | Event eligibility |
| `audience = ALL_STUDENTS` | `MAHASISWA` **or** `SR` | Future general student events; initial pilot login SR-only |

The same SR **belongs to exactly one primary actor** but may match several event audiences (`SR`, `ALL_STUDENTS`, and `KADIV` if appointed). Selection is an OR predicate for allowed audience groups; never create multiple primary roles to achieve overlap.

**Pilot caveat:** The system may store audience `ALL_STUDENTS`, but student (non-SR) sign-in is not yet supported. UI must signal this limitation; do not claim full general-student events function until that actor is enabled.

## 3. Roles and permissions
| Action | SR (non-HCO) | SR HCO member | SR KADIV HCO |
|---|---|---|---|
| View eligible events | Yes | Yes | Yes |
| View own event/attendance history | Yes | Yes | Yes |
| Check in to eligible event | Yes | Yes | Yes |
| Submit own manual request | Yes | Yes | Yes |
| Create/edit HCO attendance event | No | Yes | Yes |
| Generate/display event QR | No | Yes | Yes |
| See/export event participant attendance | No | Yes | Yes |
| Approve/reject manual attendance request | No | No | **Yes** |
| Edit/delete a recorded attendance status | No | No | **Yes**, audited |

No generic `admin` privilege grants these actions unless explicitly approved and server-enforced. Definition of "edit" should be limited to audited correction rather than destructive overwrite.

## 4. Event configuration — functional baseline
| Field | Rule / status |
|---|---|
| `title` / description | Required title; description optional (proposal) |
| `startsAt`, `endsAt` | Required and ordered; time zone displayed Asia/Jakarta |
| `audience` | `SR`, `KADIV`, `ALL_STUDENTS`; selected by HCO |
| `location.latitude/longitude` | Event center; default from an approved central configuration (coordinates **TBD**) |
| `geofenceRadiusM` | Default **20 m**, customizable for event; allowed range **TBD** |
| `lateGraceMinutes` | Default **15 min**, editable per event |
| `state` | Draft → Published → Completed/Cancelled (proposal; approval TBD) |
| `qr.enabled` | QR tied to event; expiration/rotation policy **TBD** |

Recommended semantics **for review**, not yet final: check-in only from event `startsAt` to `endsAt`; classify `PRESENT` if `serverTime <= startsAt + lateGraceMinutes`, else `LATE` before end; before start and after end display actionable error/manual-request option where permitted. **Do not treat this as signed-off without HCO review.**

## 5. End-to-end workflows
### 5.1 HCO creates event
1. SR session is validated; server verifies department HCO.
2. HCO specifies title, schedule, eligible audience, location, editable radius and grace period.
3. Backend validates start/end, bounds and permissions. Event receives stable ID.
4. HCO activates/displays an event-bound QR challenge. QR can be rotated/revoked independently of event details.
5. Event is visible to eligible SR based on selected audience and publication state.

### 5.2 SR attendance via QR
1. SR signs in with NIM/password (provisioned account only), opens scanner.
2. QR contains **opaque event-bound short-lived challenge**, never a plaintext unrestricted event token containing user privileges.
3. Backend validates session, actor=SR, active membership, target audience, event status/window, challenge validity, no prior attendance, and requested browser location.
4. Server computes distance in meters from event center, checks radius and location accuracy policy; server determines timestamp and attendance classification.
5. Atomic insert into attendance record. Duplicate submission returns stable "already recorded" response and cannot create another row.
6. SR can see own result and event history; HCO can view/export event recap.

**Security note:** Device GPS may be inaccurate or spoofed. Geofence reduces obvious off-site scans but does not guarantee presence. QR can also be shared; use expiration, event binding, auth + eligibility and auditing.

### 5.3 Manual attendance fallback
1. If geolocation is denied/inaccurate/out of radius, network fails, or QR check-in is not possible, show a **request manual attendance** path where reasonable. Unauthenticated users cannot request.
2. SR submits event + reason, optional evidence (exact mandatory fields **TBD**).
3. Request state becomes `PENDING`; this **does not** count as confirmed attendance.
4. A KADIV HCO reviews request and may `APPROVE` or `REJECT` with recorded reviewer, reason and timestamp.
5. Approval creates/corrects the attendance record atomically (avoid duplicates) and preserves immutable audit/history; refusal leaves original record unchanged.
6. Repeated approvals or concurrent check-in + approval are idempotent and cannot create duplicate attendance.

**Clarification required:** whether a manual request is valid after event end, allowable time to apply, whether the approver may set `PRESENT` vs `LATE`, and evidence policy. The intent to allow requests and KADIV approval **is confirmed**; exact policy is TBD.

### 5.4 Attendance correction
Only KADIV HCO may correct a recorded attendance classification, backed by immutable before/after audit and reason. No hard-delete of historical attendance for routine corrections. HCO member without KADIV position cannot modify existing attendance.

## 6. Main FR candidates (new NEED-001 IDs are provisional)
The historic workbook does not contain dedicated QR-scan FRs for NEED-001. **Never map FR-044..047 to this module; they describe QR attendance for NEED-007 activities.** `FR-086` is an internal attendance *recap* fragment, not the scan workflow. Assign canonical FR IDs in `03_FR Master` after approval.

| ID | Candidate requirement | State |
|---|---|---|
| N001-FR-01 | SR can authenticate via NIM/password; no public sign-up | Confirmed direction; login implementation pending |
| N001-FR-02 | HCO can create event with audience, time, location, radius, grace period | Confirmed main fields |
| N001-FR-03 | HCO can issue/revoke event-bound QR challenge; shared generator reusable | Confirmed intent; TTL TBD |
| N001-FR-04 | Eligible authenticated SR can check in to event via QR | Confirmed |
| N001-FR-05 | Server checks eligibility, time, token, duplicate scan and geolocation | Confirmed checks; thresholds/edge semantics TBD |
| N001-FR-06 | System assigns `PRESENT` or `LATE` using configurable 15-min default grace | Confirmed default; boundary semantics proposed |
| N001-FR-07 | SR can propose manual attendance and track its decision | Confirmed |
| N001-FR-08 | KADIV HCO approves/rejects manual requests; corrections are auditable | Confirmed |
| N001-FR-09 | HCO can review and export attendance by event | Confirmed |
| N001-FR-10 | SR can view own eligible/attended event history | Confirmed |

## 7. Data model candidates (NOT a final ERD)
| Entity | Important fields / constraints |
|---|---|
| `users` (Better Auth) | stable ID, username=NIM, password credential managed by auth, active/disabled flag policy TBD |
| `sr_profiles` | userId unique, NIM reference, departmentId, buildingId, positionCode (`KADIV` etc.), active state |
| `departments`, `buildings`, `positions` | dictionary tables controlled by authorized admins; imported initial data |
| `events` | id, creatorId, title, start/end, audience rules, geofence center/radius, grace minutes, status |
| `qr_challenges` | id, eventId, token hash/nonce, expiresAt, revokedAt, createdBy; keep secrets out of QR payload |
| `attendance_records` | id, eventId, userId, attendanceClass `PRESENT/LATE`, origin `QR/MANUAL`, scannedAt, event policy snapshot where needed; **unique(eventId, userId)** |
| `manual_attendance_requests` | id, eventId, requesterUserId, reason, status `PENDING/APPROVED/REJECTED`, reviewerUserId, reviewedAt, decisionReason, optional evidence |
| `audit_logs` | actor, action, resource id, before/after context, at, reason, correlation id |

Design for server-side transactions, soft deletion/retention, and proper indexes. Passwords **never** stored or exported as plaintext. Do not persist a continuous geolocation history; store only what is necessary and authorized. Work out actual tables after review.

## 8. Proposed tRPC procedures (contract sketch)
This is a **design guide**, not a guarantee about generated router names.

| Procedure | Auth rule | Result |
|---|---|---|
| `attendanceEvents.create` | `SR + department HCO` | Create draft event |
| `attendanceEvents.update` | HCO, policy on edits after attendance TBD | Update permitted event fields |
| `attendanceEvents.listEligible` | active SR | Eligible events only |
| `attendanceEvents.get` | HCO or eligible SR | Audience-scoped event details |
| `attendanceQr.issue` | HCO | Short-lived event-bound challenge |
| `attendanceQr.scan` | active eligible SR | Check-in or safe duplicate rejection |
| `attendance.mine` | logged-in SR | Only own attendance/event history |
| `attendance.byEvent` | HCO | Filtered recap |
| `attendance.exportByEvent` | HCO | Authenticated, auditable export |
| `attendanceManual.request` | eligible SR | `PENDING` request |
| `attendanceManual.listPending` | KADIV HCO | Pending requests |
| `attendanceManual.decide` | KADIV HCO | Audited approve/reject |
| `attendance.correct` | KADIV HCO | Audited correction |

Use Zod to validate payloads and recompute all authorization and attendance rules on backend. Client data is untrusted.

## 9. UI screens (minimum)
1. Login NIM/password, initial password change flow, session-expired state.
2. SR event list and event details showing eligibility/status and own attendance history.
3. QR scan/check-in screen with permission prompt, location/accuracy feedback, duplicate status, manual request action.
4. HCO create/edit event, QR display, event recap/export view.
5. KADIV HCO pending manual requests, approve/reject with reason; correction audit history.
6. Mobile friendly states: empty, error, loading, expired QR, poor GPS, blocked permissions and session expiry.

## 10. Pilot quality and security
- Geolocation API requires secure context in production (HTTPS). Browser precision can exceed chosen 20 m radius; a manual path is mandatory.
- Anti-replay: short expiry/rotation, server verification, event binding; QR is **not** a credential/attendance proof by itself.
- Atomic uniqueness for event/user attendance with well-defined idempotency and duplicate UI response.
- Explicit server-side authorization for HCO/KADIV; audit manual decisions and export accesses where appropriate.
- Never ship seeded real NIM/password data, print initial credentials to logs, or expose bulk user import endpoints publicly.
- Structured logs redact secrets, QR tokens, GPS-sensitive data.

## 11. Risks / blocked decisions before PM sign-off
| Key | Item | Owner | Effect |
|---|---|---|---|
| OPEN-001 | Event window, early check-in and after-end rules | HCO + PM | Accurate late classification |
| OPEN-002 | QR expiry/rotation/display and scanned-code behavior | HCO + RnD | Anti-replay / UX |
| OPEN-003 | Coordinates of central location; geofence min/max and GPS accuracy threshold | HCO + PM | False rejected scans |
| OPEN-004 | Manual evidence, request deadline, reviewer behavior for late vs present | KADIV HCO + PM | Correction integrity |
| OPEN-005 | SR roster import format, active flag, departments/buildings/positions mapping | PM | Authentication and eligibility |
| OPEN-006 | Better Auth required email handling despite NIM-first login, credential delivery | PM + RnD | Safe account creation |
| OPEN-007 | Live vs snapshot event eligibility and changing SR positions | PM + HCO | Audit/history accuracy |
| OPEN-008 | Export format, filters, exact sensitive fields and retention | HCO + PM | Privacy control |

## 12. Acceptance, UAT & release gate
`docs/modules/need-001/acceptance-tests.md` is the checklist. Do not mark the pilot as accepted merely because the pages render. PM signs off after HCO validates business policy, credentials are distributed securely, and real SR users finish mobile tests with QR/GPS/manual correction.
