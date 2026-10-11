# NEED-001 — Acceptance Criteria & UAT Scenarios

**Status:** Identity authentication cases tested locally in Phase 2B; domain execution/pilot UAT pending. Only explicitly marked policy details remain `TBD`.

Sources: [NEED-001 PRD](prd.md) and [canonical data model/repository review](resora-need-001-data-model.md#12-repository-compatibility-review-2026-10-10). Phase 2A identity definitions/migrations were validated locally in Phase 2A.5 and applied/read-only verified on Supabase Development in [Phase 2A.6](resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration); event/QR/attendance schema and application behavior remain future work. Use synthetic accounts only in authorized development testing until the private CSV arrives; no accounts were created in Phase 2A.6.

| ID     | Scenario / Given                                                 | When                                                            | Expected outcome                                                   | Decision state                                        |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| AT-001 | Imported active SR with valid NIM/password                       | Log in                                                          | Authenticated with one SR primary actor, no registration link/path | Confirmed                                             |
| AT-002 | Unprovisioned NIM                                                | Attempt login                                                   | Generic error; no user enumeration and no automatic registration   | Confirmed                                             |
| AT-003 | SR in department HCO                                             | Create attendance event with audience SR, radius 20m, grace 15m | Event saved; HCO can display event QR                              | Confirmed fields                                      |
| AT-004 | Ordinary SR not in HCO                                           | Try create event/issue QR/export via direct tRPC request        | Server refuses, regardless of UI                                   | Confirmed                                             |
| AT-005 | KADIV of Adaptif (not HCO) | Attempt manual insertion/correction | Server rejects | Confirmed |
| AT-006 | KADIV HCO, invited participant without attendance | Open event, search name/NIM, select profile, enter reason | One MANUAL record, default effective server time, immutable creation time and audit | Confirmed |
| AT-007 | HCO member who is not KADIV | Attempt manual insertion/correction via direct request | Server rejects | Confirmed |
| AT-008 | SR event                                                         | Match event audience `SR`                                       | Can see/check in when all other conditions valid                   | Confirmed                                             |
| AT-009 | KADIV event                                                      | SR `position=KADIV`, any department                             | Eligible                                                           | Confirmed                                             |
| AT-010 | KADIV event                                                      | SR ordinary member                                              | Ineligible, cannot bypass with forged request                      | Confirmed                                             |
| AT-011 | ALL_STUDENTS event                                               | Authenticated SR                                                | Included by audience rule despite only one actor                   | Confirmed                                             |
| AT-012 | ALL_STUDENTS event                                               | Non-SR student during pilot                                     | No login / cannot check in until student actor implemented         | Explicit MVP limitation                               |
| AT-013 | Active invited SR, valid QR and location | Scan while QR active, including before start/after end | One PRESENT record with actual server timestamp and EARLY/ON_TIME/LATE timing | Confirmed |
| AT-014 | Same user scans same QR twice                                    | Scan twice or concurrent requests                               | Exactly **one** confirmed attendance; stable duplicate result      | Confirmed                                             |
| AT-015 | Revoked or expired event QR | Scan despite event still in progress | Denied; no attendance change or attendee data leakage | Confirmed |
| AT-016 | Participant beyond configured radius | Try scan | No automatic attendance; direct participant to KADIV HCO for manual entry | Confirmed |
| AT-017 | Location denied/unverifiable GPS accuracy | Try scan | No automatic attendance; contact KADIV HCO for manual entry | Confirmed fallback; accuracy threshold TBD |
| AT-018 | KADIV HCO manual entry | Submit without reason or with blank reason | Rejected; no attendance or partial audit write | Confirmed |
| AT-019 | Existing attendance record | KADIV HCO corrects effective time with reason | Preserve original recorded_at **and original source**; recalculate timing; append immutable before/after audit | Confirmed |
| AT-020 | Event grace configured to 30 min | Scan at start +30min and +30min 1sec | ON_TIME at inclusive boundary, then LATE; presence remains PRESENT | Confirmed |
| AT-021 | HCO report includes every published invitee | View/export CSV | NIM/name, organization fields, presence, effective time, timing, duration, source; include missing records; exclude secrets/raw GPS | Confirmed columns; duration/retention TBD |
| AT-022 | SR accesses other's attendance record                            | Direct request                                                  | Forbidden, own-history only                                        | Confirmed                                             |
| AT-023 | QR and KADIV manual insertion for same event/user | Concurrent requests reach DB | One attendance row; successful manual mutation audited atomically; no duplicate or orphan audit | Required integrity |
| AT-024 | Malformed center/radius/schedule | Save event | Reject malformed coordinates, nonpositive radius/TTL or unordered schedule; permitted configurable bounds reviewed separately | Validation design; radius/TTL/grace limits TBD |
| AT-025 | Actual SR on common smartphone and campus network                | End-to-end pilot                                                | Login, QR, GPS, fallback and history usable with HTTPS             | Mandatory UAT                                         |
| AT-026 | Event starts 13:00, grace 15min, QR active | Scan at 12:59:59 /13:00/13:15/13:15:01 | EARLY /ON_TIME/ON_TIME/LATE; all PRESENT; server time authoritative | Confirmed |
| AT-027 | Event ends 14:00, QR active until 18:00 | Scan at 15:00 with all other checks valid | Allowed, PRESENT and LATE; scheduled end is not a cutoff | Confirmed |
| AT-028 | HCO activates QR at 12:00 with default lifetime | Display QR at activation and refresh before expiry | Same token/QR, expires 18:00, no automatic rotation | Confirmed; redisplay protocol proposed |
| AT-029 | Event QR configured for another lifetime | Activate, then authorized HCO revokes early | Configured expiration from activation; revoked token immediately unusable | Confirmed; lifetime bounds TBD |
| AT-030 | Attacker substitutes another event/token or forges privileges/time | Submit check-in | Backend rejects invalid binding/token; never trusts client classification/time/permissions | Confirmed |
| AT-031 | Event audience selects eligible active roster | Publish event | Participant snapshot committed with publication; only invitees may check in | Confirmed; storage proposed |
| AT-032 | Invited SR changes department/position/building after publication | View historical event report | Invitation and organization snapshot retained; do not silently refresh roster | Confirmed snapshot; cancellation/republication handling TBD |
| AT-033 | Invitee is later inactive, including a stored session | Attempt login or QR check-in | Both rejected regardless of participant snapshot; historical invitation retained | Confirmed |
| AT-034 | Invited participant has no attendance record | Report before closure, then after confirmed window closure | PENDING/not yet present, then ABSENT; no fabricated attendance timestamp/class/source | Confirmed: explicit authorized HCO closure |
| AT-035 | KADIV HCO records manual attendance at 17:00 for actual 13:05, event starts 13:00 | Enter reason and override effective time | attendance_at 13:05, recorded_at 17:00, ON_TIME; actor/reason audited | Confirmed; permitted override bounds TBD |
| AT-036 | Manual correction/audit transaction fails | Save correction | Roll back both changes; no destructive history overwrite or partial mutation | Required integrity |
| AT-037 | Initial superadmin account and HCO/KADIV accounts | Change SR assignments/active status | Only superadmin system privilege succeeds; exactly one primary actor, not a fifth actor | Confirmed |
| AT-038 | Synthetic provisioning CSV | Validate/import NIM, name, real email, department, position, building, active status | Unique identifiers, complete assignments, NIM kept as text; no public signup or credentials in Git/logs | Confirmed columns; mapping proposed |
| AT-039 | Provisioned SR temporary credentials | First login, then change password | Secure initial credential handling; protected app gate until required change succeeds | Gate tested Phase 2B; provisioning/distribution pending |
| AT-040 | User calls public signup directly | Submit signup despite hidden UI | Backend rejects; no public account created | Confirmed |
| AT-041 | Phase 2 Gmail SMTP configured with synthetic/test recipient | Verify recovery/email-verification flows and sender identity | Display name RnD SR XIV; address/credentials environment-only; secrets absent from docs/logs | Confirmed direction; operational policy TBD |
| AT-042 | QR or MANUAL present participant and absent invitee | Export CSV | Attendance source/timing/time only where relevant; all invitees included; no passwords/sessions/QR secrets/raw GPS | Confirmed; XLSX optional |
| AT-043 | QR reused by different invited active users during its lifetime | Each checks in once | Same static QR valid for each invitee; duplicates per event/user rejected | Confirmed |
| AT-044 | Published event | HCO edits title/description, then attempts audience/start/end edits via direct request | Title/description edits allowed; audience/schedule changes rejected; existing participant snapshot retained | Confirmed; future implementation |
| AT-045 | Published event with active QR and invited non-attendee | Authorized HCO explicitly closes event | Active QR invalidated atomically; scans denied; non-attendee reported ABSENT; existing attendance retained | Confirmed; future implementation |
| AT-046 | Expired or revoked QR, event not explicitly closed | HCO reissues challenge | New activation + configured TTL (default six hours); previous challenges remain invalid; no automatic rotation | Confirmed; future implementation |
| AT-047 | No attendance record and QR expired | Report before HCO explicitly closes, then after close | Pending before closure; ABSENT after close, regardless of scheduled end | Confirmed; future implementation |
| AT-048 | Attendance originally sourced QR or MANUAL | KADIV HCO corrects effective time/reason | Original source and recorded_at preserved; immutable audit captures correction; automatic timing recalculation | Confirmed; future implementation |
| AT-049 | Published event center/radius/late tolerance | Attempt edit after publication | Freeze recommended; executable expectation awaits final PM confirmation | PROPOSED safeguard, not an approved acceptance gate |

## Phase 2B authentication execution (2026-10-11)

Local PostgreSQL synthetic fixtures only; no Supabase mutation/migration. `pnpm run test:auth`: **16 passed, zero failed/skipped** when the explicit local scratch URL is set. AT-001/002/040 and the password-gate portion of AT-039 are covered; actual CSV provisioning/distribution and SMTP are not delivered. See [full evidence](resora-need-001-data-model.md#16-phase-2b-sr-authentication).

| ID | Scenario | Expected and observed result |
| --- | --- | --- |
| AUTH-01 | Active SR, correct string NIM/password, including leading zeros | Session created; protected API allowed after password gate; exact NIM retained. |
| AUTH-02 | Wrong/unregistered NIM, wrong password, inactive/non-SR or missing identity profile | Generic credential denial; no new session, password or account details disclosed; numeric NIM rejected. |
| AUTH-03 | Unauthenticated, logged-out or expired session | Protected API denied; frontend dashboard redirects to login. |
| AUTH-04 | Old valid session after deactivation or non-SR reassignment | Next protected request denied using live DB identity, regardless of cookie. |
| AUTH-05 | Required first change, incorrect current password or unchanged new password | Protected API/dashboard blocked; failed change cannot clear flag. Verified different password releases gate and invalidates old sessions. |
| AUTH-06 | Direct public signup/email-login/update-username request | Denied by backend; no signup UI; no account mutation. |
| AUTH-07 | Repeated login attempts with forged forwarded-IP headers | Framework throttles with HTTP 429; socket address cannot be overridden by client. |
| AUTH-08 | Missing/untrusted Origin on auth POST | HTTP 403 before credential verification. |

Headless Edge with isolated temporary profile, production Next.js and local Express passed: anonymous redirect/input/signup checks; invalid credentials; first login and blocked dashboard; password change and displayed leading-zero NIM; logout and protected-page rejection; login again with changed password; deactivated-account redirect/session message. This is local browser smoke evidence, not mobile/HTTPS/pilot UAT or a committed browser regression suite.

**Domain discrepancy:** older audience/event-bound QR scenarios above predate the latest PRD's SR participant builder and session-based attendance. They are not executable policy authority for future domain work until reconciled with PM. Phase 2B covers identity only and does not change event acceptance decisions.


## Approval fields

- **HCO policy validation:** TBD
- **PM acceptance:** TBD
- **Tester(s), date, environment and actual results:** TBD
- **Blocking issues/defects:** TBD

A `TBD` scenario is **not automatically passing**. Review the [PRD](prd.md) before writing tests that assert unknown policy as fact.

These are acceptance specifications, not executed automated tests. Remaining gates: cancellation/reopening/republication handling, final PM confirmation of center/radius/tolerance freeze, GPS/radius limits, override bounds (including now-inactive invitees and post-closure manual operations), lateness rounding, CSV values, credential delivery, retention and SMTP operations. Phase 2A identity tests are code-level checks, not completion of these application acceptance scenarios. See the canonical model §10/§12.
