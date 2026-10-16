# NEED-001 — Acceptance Criteria & UAT Scenarios

**Current domain baseline (2026-10-12):** composable active-SR roster and session-based shared attendance; [canonical model](resora-need-001-data-model.md). Phase 4/4.5 are PM-accepted; Phase 5/6 migrated and targeted PostgreSQL verified on Development (six migrations). Phase 6 passed 17 groups including five concurrency cases, with listed live role/inactive-profile gaps. Mobile HTTPS/device UAT remains deferred to Phase 8. Historical Phase 2B/3 evidence below records its original state.

**Status:** Phase 7 quality review; remote CI, live-profile gaps and Phase 8 UAT pending. Only explicitly marked policy details remain `TBD`.

Sources: [NEED-001 PRD](prd.md) and [canonical data model/repository review](resora-need-001-data-model.md#12-repository-compatibility-review-2026-10-10). Phase 2A identity definitions/migrations were validated locally in Phase 2A.5 and applied/read-only verified on Supabase Development in [Phase 2A.6](resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration); Phase 4 event/session/QR schema is locally validated only; records/audit and remote application remain future work. Use synthetic accounts only in authorized development testing until the private CSV arrives; no accounts were created in Phase 2A.6.

| ID     | Scenario / Given                                                 | When                                                            | Expected outcome                                                   | Decision state                                        |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| AT-001 | Imported active SR with valid NIM/password                       | Log in                                                          | Authenticated with one SR primary actor, no registration link/path | Confirmed                                             |
| AT-002 | Unprovisioned NIM                                                | Attempt login                                                   | Generic error; no user enumeration and no automatic registration   | Confirmed                                             |
| AT-003 | SR in department HCO                                             | Create attendance event with audience SR, radius 20m, grace 15m | Event saved; HCO can display event QR                              | Confirmed fields                                      |
| AT-004 | SR not in HCO, without SUPERADMIN                                           | Try create event/issue QR/export via direct tRPC request        | Server refuses, regardless of UI                                   | Confirmed                                             |
| AT-005 | KADEP of Adaptif (not HCO), without SUPERADMIN | Attempt manual insertion/correction | Server rejects | Confirmed |
| AT-006 | KADEP HCO, invited participant without attendance | Open event, search name/NIM, select profile, enter reason | One MANUAL record, default effective server time for the target session, immutable creation time and audit | Confirmed |
| AT-007 | HCO member who is not KADEP, without SUPERADMIN | Attempt manual insertion/correction via direct request | Server rejects | Confirmed |
| AT-008 | SR event                                                         | Match event audience `SR`                                       | Can see/check in when all other conditions valid                   | Confirmed                                             |
| AT-009 | Draft selects all KADEP across departments | Preview active SR KADEP from HCO, RND and other departments | All eligible KADEP selected; position is not a primary actor | Confirmed roster builder; future implementation |
| AT-010 | Draft selects only KADEP, no individual includes | Ordinary active SR attempts scan after publication | Not invited; forged department/position cannot bypass snapshot | Confirmed; future implementation |
| AT-011 | Draft combines HCO department, all KADEP and individual includes/excludes | Preview overlapping SR and explicit exclusions | Deduplicated by user_id; excluded users absent; inclusion does not create presence | Confirmed capabilities; criteria representation proposed |
| AT-012 | Non-SR or inactive account selected individually | Preview/publish and direct check-in | Cannot enter active-SR roster or gain pilot login/check-in; INTI department filter and INTI + non-INTI KADEP union are available | Confirmed Phase 4 boundary |
| AT-013 | Active invited SR, valid session QR and location | Scan while session and QR active, including before start/after end | One PRESENT record with actual server timestamp and EARLY/ON_TIME/LATE timing | Confirmed |
| AT-014 | Same user and attendance session, valid QR | Retry or concurrent requests | Exactly one record via unique `(session_id, user_id)`; stable duplicate response without timestamp changes | Required shared-engine integrity |
| AT-015 | Revoked or expired session QR | Scan despite event still in progress | Denied; no attendance change or attendee data leakage | Confirmed |
| AT-016 | Participant beyond configured radius | Try scan | No automatic attendance; direct participant to KADEP HCO for manual entry | Confirmed |
| AT-017 | Location denied/unverifiable GPS accuracy | Try scan | No automatic attendance; contact KADEP HCO for manual entry | Confirmed: accuracy >20 m rejected; positive accuracy <=20 m accepted subject to radius |
| AT-018 | KADEP HCO manual entry | Submit without reason or with blank reason | Rejected; no attendance or partial audit write | Confirmed |
| AT-019 | Existing attendance record | KADEP HCO corrects effective time with reason | Preserve original recorded_at **and original source**; recalculate timing; append immutable before/after audit | Confirmed |
| AT-020 | Event grace configured to 30 min | Scan at start +30min and +30min 1sec | ON_TIME at inclusive boundary, then LATE; presence remains PRESENT | Confirmed |
| AT-021 | HCO report includes every published invitee | View/export CSV | NIM/name, organization fields, presence, effective time, timing, duration, source; include missing records; exclude secrets/raw GPS | Confirmed: ceil minutes past grace Phase 6; retention TBD |
| AT-022 | SR accesses other's attendance record                            | Direct request                                                  | Forbidden, own-history only                                        | Confirmed                                             |
| AT-023 | QR and KADEP HCO manual insertion for same session/user | Concurrent requests | One attendance row; manual mutation/audit atomic; no duplicates/orphans | Required integrity; future implementation |
| AT-024 | Malformed center/radius/schedule | Save event | Reject malformed coordinates, nonpositive radius/TTL or unordered schedule; permitted configurable bounds reviewed separately | Validation design; radius/TTL/grace limits TBD |
| AT-025 | Actual SR on common smartphone and campus network                | End-to-end pilot                                                | Login, QR, GPS, fallback and history usable with HTTPS             | Mandatory UAT                                         |
| AT-026 | Event starts 13:00, grace 15min, QR active | Scan at 12:59:59 /13:00/13:15/13:15:01 | EARLY /ON_TIME/ON_TIME/LATE; all PRESENT; server time authoritative | Confirmed |
| AT-027 | Event ends 14:00, attendance session active and QR valid until 18:00 | Scan at 15:00 with all other checks valid | Allowed, PRESENT and LATE; scheduled end is not a cutoff | Confirmed |
| AT-028 | HCO activates attendance session and its QR at 12:00 with default TTL | Display QR at activation and refresh before expiry | Same token/QR, expires 18:00, no automatic rotation | Confirmed; redisplay protocol proposed |
| AT-029 | Session QR configured for another lifetime | Activate, then authorized HCO revokes early | Configured expiration from activation; revoked token immediately unusable | Confirmed; lifetime bounds TBD |
| AT-030 | Attacker substitutes another session/challenge or forges event/context/privilege/time | Submit check-in | Backend validates challenge-session-parent binding and domain eligibility; ignores client authority/time | Confirmed boundary; protocol/storage proposed |
| AT-031 | Composable active-SR draft preview | Publish after directory changes | Resolve current eligible roster again from consistent view; snapshot/publication commit together or neither | Confirmed snapshot; transaction design review |
| AT-032 | Invited SR changes department/position/building after publication | View historical event report | Invitation and organization snapshot retained; do not silently refresh roster | Confirmed snapshot; cancellation/republication handling TBD |
| AT-033 | Invitee is later inactive, including a stored session | Attempt login or QR check-in | Both rejected regardless of participant snapshot; historical invitation retained | Confirmed |
| AT-034 | Invited participant has no attendance record | Report before closure, then after confirmed window closure | PENDING/not yet present, then ABSENT; no fabricated attendance timestamp/class/source | Confirmed: explicit authorized HCO closure |
| AT-035 | KADEP HCO records manual attendance at 17:00 for actual 13:05, event starts 13:00 | Enter reason and override effective time | attendance_at 13:05, recorded_at 17:00, ON_TIME; actor/reason audited | Confirmed Phase 6: <= now and <= closed_at when CLOSED |
| AT-036 | Manual correction/audit transaction fails | Save correction | Roll back both changes; no destructive history overwrite or partial mutation | Required integrity |
| AT-037 | Initial superadmin account and HCO/KADEP accounts | Change SR assignments/active status | Only superadmin system privilege succeeds; exactly one primary actor, not a fifth actor | Confirmed |
| AT-038 | Synthetic provisioning CSV | Validate/import NIM, name, real email, department, position, building, active status | Unique identifiers, complete assignments, NIM kept as text; no public signup or credentials in Git/logs | Confirmed columns; mapping proposed |
| AT-039 | Provisioned SR temporary credentials | First login, then change password | Secure initial credential handling; protected app gate until required change succeeds | Gate tested Phase 2B; provisioning/distribution pending |
| AT-040 | User calls public signup directly | Submit signup despite hidden UI | Backend rejects; no public account created | Confirmed |
| AT-041 | Phase 2 Gmail SMTP configured with synthetic/test recipient | Verify recovery/email-verification flows and sender identity | Display name RnD SR XIV; address/credentials environment-only; secrets absent from docs/logs | Confirmed direction; operational policy TBD |
| AT-042 | QR or MANUAL present participant and absent invitee | Export CSV | Attendance source/timing/time only where relevant; all invitees included; no passwords/sessions/QR secrets/raw GPS | Confirmed; XLSX optional |
| AT-043 | Current static session QR used by different invited active SR | Each checks in once | Same QR valid per invitee while session active; duplicates per session/user rejected | Confirmed |
| AT-044 | Published event | HCO edits title/description, then attempts roster criteria/invitees/start/end edits via direct request | Title/description edits allowed; roster/schedule changes rejected; existing participant snapshot retained | Confirmed; future implementation |
| AT-045 | Published event with one active attendance session/QR and invited non-attendee | Authorized HCO closes event | Event/session close and challenge invalidation atomic; scans denied; non-attendee ABSENT; records/snapshot retained | Confirmed; future implementation |
| AT-046 | Expired/revoked QR on active session of nonclosed event | HCO explicitly reissues | New challenge for same session, activation + configured TTL; old challenge invalid; no automatic rotation/reopening | Confirmed; future implementation |
| AT-047 | No attendance record and QR expired | Report before HCO explicitly closes, then after close | Pending before closure; ABSENT after close, regardless of scheduled end | Confirmed; future implementation |
| AT-048 | Attendance originally sourced QR or MANUAL | KADEP HCO corrects effective time/reason | Original source and recorded_at preserved; immutable audit captures correction; automatic timing recalculation | Confirmed; future implementation |
| AT-049 | Published event center/radius/late tolerance | Attempt edit after publication | Center/radius/grace/QR TTL changes rejected; only title/description editable | Confirmed PM FINAL; tested locally |
| AT-050 | Draft preview, inactive include, duplicate and excluded identities | Preview/publish | Only current active SR, include/exclude applied with visible conflicts and deduplication; assignment/master data unchanged | Confirmed capabilities; conflict UI design proposed |
| AT-051 | Published event E with its one session S and valid QR | Try check-in before session activation, after session close, or with foreign session/token | Rejected; publication/schedule alone does not activate attendance; binding and active state checked server-side | Confirmed internal_event_id UNIQUE NOT NULL FK; tested locally |
| AT-052 | General Adaptif activity (future NEED-007) | Shared engine asks Activity public backend interface about registration | Successful active/noncancelled registration required; no internal invitation FK or private Activity table access; HCO denied, authorized Adaptif manual allowed without KADEP | Future interface boundary; consistency contract TBD |
| AT-053 | Attempt standalone session close or reopen/cancel/republish | Inspect supported API/UI | No such endpoint/UI in NEED-001; close event atomically closes session and QR | Confirmed PM FINAL; future manual extensions TBD |

## Phase 5 acceptance baseline (2026-10-12)

PM applied `20261012032606_phase5_checkin` to Supabase Development. Read-only verification matched all five migration hashes, columns, indexes, constraints and enabled triggers. Eighteen distinct targeted PostgreSQL cases passed, including parallel duplicate, close, revoke/reissue and SQL origin/constraint checks. Twelve isolated fixture events were cleaned with existing data unchanged. Live inactive/invalid-assignment DB-profile reload remains unverified (service-context rejection tested); mobile HTTPS UAT is pending.

| ID | Scenario | Expected |
| --- | --- | --- |
| AT-P5-01 | Valid invited active SR, signed current QR, accuracy <=20 m, within radius | QR record stores three numeric GPS fields; response contains event/time/timing, no GPS/token |
| AT-P5-02 | NaN/infinite/out-of-range coordinates, accuracy ?0 or >20 m, outside radius | Reject without attendance or failed-location storage |
| AT-P5-03 | Early/start/exact grace/after grace/after scheduled end | EARLY / ON_TIME / ON_TIME / LATE; end is not a cutoff while QR/session valid |
| AT-P5-04 | Valid duplicate/concurrent check-in | One record; ALREADY_CHECKED_IN with original timestamp/class/source/GPS unchanged |
| AT-P5-05 | Invalid/revoked/expired QR or closed/inactive session, even with an existing record | Reject before revealing attendance; close/check-in serialize event then session |
| AT-P5-06 | Inactive/non-SR, invalid assignment, not invited, first-password-change gate | Server denies; client cannot submit identity/time/permission claims |
| AT-P5-07 | GPS permission denied/timeout/unavailable, poor accuracy/outside radius | Explain error; direct to KADEP HCO, no bypass or manual request flow |
| AT-P5-08 | Mobile scanner lifecycle | Notice before GPS permission; explicit camera start; stop on completion/failure/unmount; HTTPS required on phone |

Retention and dedicated GPS audit access remain required before Production/real pilot.

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


## Phase 3 foundation acceptance (CLI)

| Check | Expected result | Local automated evidence |
| --- | --- | --- |
| HCO ANGGOTA/SEKDEP vs HCO KADEP | All manage internal operations; only KADEP can correct manually | Policy unit tests |
| ADAPTIF ANGGOTA/KADEP vs HCO/SOSIAL | Adaptif general operations/manual allowed without KADEP; no cross-context grants | Policy unit tests |
| RND KADEP; explicit SUPERADMIN non-HCO | No inferred admin; explicit eligible SUPERADMIN grants system admin and operational override (SA-01) | Unit/live DB grant/revoke tests |
| Anonymous/invalid session, inactive/non-SR, pending password change | Denied; live database changes take effect on next request | Existing protected API and auth regression tests |
| Forged department/position/privilege input | Cannot change DB-derived authorization | Existing protected API test, no dummy endpoint |
| Official dictionaries and rerun | 7/7/18, unchanged UUIDs/assignments; conflicts roll back | Organization integration tests |
| CSV A/F/1/12 and KADEP; KADIV/unknown codes | Official codes resolve active DB references; legacy/unknown rejected | Provisioning unit/integration tests |

These validate the policy/seed foundation, not unbuilt event/attendance workflows above. [Canonical codes/matrix](resora-need-001-data-model.md#8-server-side-authorization-phase-3); Inti mapping and physical cross-module binding/lifecycle policy remain open; current roster/session documentation is synchronized.

## Approval fields

- **HCO policy validation:** TBD
- **PM acceptance:** TBD
- **Tester(s), date, environment and actual results:** TBD
- **Blocking issues/defects:** TBD

A `TBD` scenario is **not automatically passing**. Review the [PRD](prd.md) before writing tests that assert unknown policy as fact.

These are acceptance specifications, not executed automated tests. Remaining gates: cancellation/reopening/republication handling, publication freeze is final; operational radius bounds/accuracy tuning after UAT, Phase 6 override bounds/inactive correction/lifecycle/lateness are confirmed; remaining actual roster/credential delivery, retention and SMTP operations. Phase 2A identity tests are code-level checks, not completion of these application acceptance scenarios. See the canonical model §10/§12.

## Phase 4 event/session/QR verification (2026-10-11)

Guarded local PostgreSQL only; no Supabase mutation. Targeted tests cover 56 organization pairs (25 valid), 8/7/18 seed and adding INTI idempotently, CSV pair validation, roster UNION/include/exclude/deduplication, legacy/inactive/non-SR exclusion, HCO authorization with no INTI/SUPERADMIN bypass, actual Express/tRPC authentication/password/forged-input rejection, exactly-one session and immutable binding, atomic create/publish/close failure paths, live publication and historical snapshot, published fields frozen, stable signed PNG, expiry/revoke/reissue/binding and concurrent activation/reissue.

Phase 4 covers storage/lifecycle portions of AT-003/004/009/011/012/024/028/029/030/031/032/044/045/046/049/050/051/053. Attendance/report assertions in those scenarios remain future work; no check-in or presence report is claimed complete. Browser/mobile UAT and remote migration are not performed.

## Phase 6 acceptance baseline (2026-10-12)

Phase 6 migration `20261012071912_phase6_reporting` was applied with separate PM approval to verified Supabase Development using Session Pooler 5432 and verified TLS. History contains six matching migrations, no pending migration. Seventeen real PostgreSQL test groups passed (12 rollback-based, five committed concurrency cases), including audit guards, rollback on audit failure, manual/QR uniqueness, correction chain and concurrent close. Six temporary events rolled back completely; one explicitly approved concurrency fixture remains CLOSED with two records/four immutable audits. Data outside the fixture was unchanged. Live inactive-target/historical-inactive and additional role combinations remain unverified; Phase 7 does not mutate remote identities or repeat those suites.

| ID | Scenario | Expected |
| --- | --- | --- |
| AT-P6-01 | HCO member / KADEP HCO / non-HCO including SUPERADMIN | HCO or explicit eligible SUPERADMIN recap/export; KADEP HCO or explicit eligible SUPERADMIN manual/audit; resource rules unchanged |
| AT-P6-02 | PUBLISHED/INACTIVE or ACTIVE, CLOSED/CLOSED vs DRAFT | Approved states allowed; DRAFT denied; no lifecycle reactivation |
| AT-P6-03 | CLOSED insert missing time; future time; after-close time | Reject; explicit time <= now/closed_at, ends_at not cutoff |
| AT-P6-04 | Inactive snapshot participant, existing vs new record | Historical correction allowed, new insertion denied |
| AT-P6-05 | QR/MANUAL correction with reason | Preserve origin/GPS; atomically append effective time/timing before/after |
| AT-P6-06 | Missing reason; duplicate QR/manual; audit failure | Reject blank; one record without overwrite; record/audit rollback together |
| AT-P6-07 | Concurrent corrections/close/manual | Event → session → record order; current before-state, CLOSED policy, QR stays invalid |
| AT-P6-08 | Audit update/delete/truncate, wrong binding or unapproved JSON | DB guards reject; safe audit DTO only |
| AT-P6-09 | Snapshot invitee with/without record before/after close | PRESENT/PENDING/ABSENT; no fabricated rows; historical identity |
| AT-P6-10 | Grace boundary, grace +1ms, missing attendance | ON_TIME/0; LATE/1 minute; missing effective fields NULL |
| AT-P6-11 | Own history/forged userId/anonymous/inactive/password gate | Session user only, pagination; forged authority and invalid identity denied |
| AT-P6-12 | CSV quotes/newlines/formulas/leading-zero NIM | All invitees, UTF-8/WIB, escaping/text marker/formula defense; no GPS/secrets/audit JSON |

Manual frontend UAT and retention/export-access audit decisions remain pending; specific live-profile gaps are listed below.

## Phase 7 quality/security traceability (2026-10-12)

| Acceptance | Evidence/environment | Status / remaining gate |
| --- | --- | --- |
| AT-001/002/039/040, AUTH-01–08 | Existing Phase 2B local PostgreSQL evidence retained; current offline Username Plugin, signup/origin/cookie/limiter tests | PASS offline regression; HTTPS/long-lived session deployment UAT pending |
| AT-003/004/009–015/026–033/044–051, AT-P5-01–06 | Existing roster/QR/check-in offline tests; prior Phase 4/5 PostgreSQL evidence retained | PASS regression; no remote suites repeated |
| AT-006/018/019/021–023/034–036/042/048, AT-P6-01–12 | Phase 6 Development: 17 groups passed, including five concurrency cases; current offline reporting/manual tests | PARTIAL only for listed live-role/inactive transitions and frontend UAT |
| AT-P5-07/08, frontend scanner | Media track/error helper doubles and cache invalidation code audit; no browser/device automation | PASS helper regression; actual camera/GPS/HTTPS field UAT pending |
| AUTH-03/04/05, AT-004/005/007/022, AT-P6-11 | Direct loopback HTTP on actual Express/tRPC with auth/DB doubles: negative role matrix, inactive/password gate, forged input, safe errors | PASS mocked transport regression; not PostgreSQL live-profile evidence |
| Security headers/origin/privacy | Direct HTTP origin/CORS/no-store/header/IP checks; actual Better Auth malformed-body limiter and forbidden signup/origin checks | PASS offline/loopback; production proxy/TLS/cookie topology pending |
| PR quality | Main-target workflow and local synthetic-env quality gates; no live credentials/DB jobs | Remote GitHub Actions pending; no claim of remote green run |

Remaining items are gates, not automatic passes. Live-profile proof: Pending live PostgreSQL combinations: new inactive-target insertion denial; historical inactive correction; HCO non-KADEP/KADEP non-HCO manual denial; non-HCO SUPERADMIN bypass denial. Offline policy/service and loopback HTTP with auth/DB doubles cover these negative paths but are not live-profile proof. The smallest additional gate is PM-approved synthetic identities/status transitions with rollback or explicitly retained immutable audit fixtures; no real SR accounts/remote writes are authorized by Phase 7.

Open release gates: mobile HTTPS/camera/GPS UAT, real-data privacy notice/retention/export-access policy, deployment origin/cookie/proxy/multi-worker limiter/backup review. Owner: PM + HCO + RnD; release-blocking until Phase 8 acceptance. No new product behavior or retention automation is inferred.

**Executed Phase 7:** 99 offline cases plus 3 WIB input/display cases passed; changed HTTP tests reran 8/8 without repeating the rest. Global Biome, six workspace typechecks, server/web builds, Varlock codegen/Next typegen and diff checks pass locally with synthetic CI env. Real PostgreSQL integration was not rerun. Confirmed findings (P2, RnD) fixed: tRPC Origin enforcement, missing headers/no-store, raw query-toast messages, scanner fallback/cache/track release and browser-timezone-dependent draft inputs. No confirmed P0/P1 defect remains in the audited scope; this is not device UAT or release approval.

| Remaining gate | Severity/status | Owner / minimum next approval |
| --- | --- | --- |
| Four live inactive/role combinations | PENDING evidence; release gate, not a confirmed defect | PM + RnD: explicitly approve synthetic status/assignment/privilege transitions within rollback fixtures; no real users |
| Mobile HTTPS camera/GPS, layout and UX | PENDING Phase 8 field UAT | PM + HCO |
| Proxy/cookie topology, limiter across workers/NAT, backup and privacy/retention/export-access policy | PENDING release security/operations | PM + RnD/DevOps + HCO |
| GitHub Actions/fresh Linux frozen installation | PENDING remote CI, no run claimed | Reviewer after approved PR push |

## SA-01 authorization regression - 2026-10-13

This PM decision supersedes earlier SUPERADMIN operational-denial expectations, including dated Phase 4/7 evidence. No grant is inferred from organization assignment.

| ID | Scenario | Expected | Evidence |
| --- | --- | --- | --- |
| AT-SA-01 | Explicit SUPERADMIN on RND/ANGGOTA or INTI/KETUM | Event create/publish/session/QR/close and manual/correction/audit/recap/export authorized with unchanged assignment | Targeted offline policy + actual tRPC router/service tests with DB doubles |
| AT-SA-02 | Grant revoked with same session, or while request waits on lifecycle locks | Next request and transaction re-read deny privileged operation; no writes | Targeted offline tRPC tests; real PostgreSQL concurrency not run in SA-01 |
| AT-SA-03 | Anonymous/inactive/password-change-gated SUPERADMIN; forged client claims | Auth/eligibility/password gates still deny; client input cannot grant permission | Existing HTTP and targeted policy/tRPC negative tests |
| AT-SA-04 | SUPERADMIN attempts DRAFT manual attendance, non-invited/inactive new target or invalid effective time | Reject with no attendance/audit write | Targeted offline tRPC tests |
| AT-SA-05 | SUPERADMIN corrects QR attendance | Original source/recorder/recorded_at/reason/GPS unchanged; audit uses authenticated operator | Targeted offline tRPC tests |

Live grant/revoke concurrency and role UAT remain separate verification gates; offline doubles are not PostgreSQL evidence. No DB mutation or new privileged account is performed by SA-01.

## SA-02 account administration acceptance

| ID | Scenario | Expected | Verification |
| --- | --- | --- | --- |
| AT-SA2-01 | Eligible SUPERADMIN; ordinary/inactive/invalid-assignment/password-gated/revoked/anonymous identity | List/reference/create restricted to valid SUPERADMIN; transaction re-read rejects revocation | Offline actual tRPC/service tests with DB double |
| AT-SA2-02 | Create one valid SR, including leading-zero NIM and normalized email | Better Auth credential hash, active SR profiles, mandatory password change, no SUPERADMIN grant, one actor/target audit | Real Better Auth adapter/hash with offline persistence |
| AT-SA2-03 | Duplicate NIM/email, invalid/inactive references, invalid INTI pair, raced unique violation | Sanitized validation/conflict, no partial identity | Targeted offline tests; SA-03 also verifies concurrent creation on local PostgreSQL |
| AT-SA2-04 | Profile/credential/audit insert fails | All account writes rollback | Offline transaction double; SA-03 also verifies profile/audit failure rollback on local PostgreSQL |
| AT-SA2-05 | Lost commit acknowledgement | Uncertain result; inspect list before retry; do not claim account failed | Targeted offline simulation |
| AT-SA2-06 | List inactive SR, search/filter/page | Default 20/max 50, stable order, required identity fields only; no hash/token | Query double/SQL parameter checks |
| AT-SA2-07 | Create UI success, copy, close/navigation | Temporary password appears once in local state, no query/mutation cache/storage/log/URL; mandatory change instructions | Static UI regressions; manual responsive/copy/navigation UAT pending |
| AT-SA2-08 | CSV provisioning after shared helper extraction | Dry-run makes no writes; eight-character password and COMMITTED export semantics retained | Offline adapter/transaction/output double |

Initial SA-02 evidence was offline only. SA-03 now supplements it with local PostgreSQL trigger/lock/concurrency evidence below; the account audit migration remains unapplied remotely. Manual UAT requires an approved environment and synthetic accounts; do not create real users during review.

## SA-03 integration acceptance

SA-03 supersedes SR-only login/first-admin assumptions above. SUPERADMIN is still a privilege; SYSTEM_ADMIN is the new dedicated primary actor. No existing SR is upgraded during bootstrap.

| ID | Scenario | Expected/evidence |
| --- | --- | --- |
| AT-SA3-01 | SR login and dedicated username login | Actual Better Auth/PostgreSQL login and first password change pass; system profile has no SR/NIM fields |
| AT-SA3-02 | Grant missing, inactive or pending password change | Subsequent requests denied; grant revoke while manual mutation waits for event lock denies write on PostgreSQL |
| AT-SA3-03 | Dedicated operator event/QR/manual/recap/audit/CSV | Actual tRPC/services with PostgreSQL pass; original system operator IDs preserved; business state/target validations retained |
| AT-SA3-04 | SR directory/snapshot/system self-scan/own history | Directory and snapshot exclude system admin; QR self-check-in and own history rejected |
| AT-SA3-05 | Dry-run, export failure, audit/profile failure | No partial user/credential/profile/grant; real PostgreSQL transaction rollback passes |
| AT-SA3-06 | Concurrent bootstrap and account creation; concurrent correction | One bootstrap/account winner and matching audit; sequential before/after correction audit; no deadlock in targeted tests |
| AT-SA3-07 | SR consistency and account audit guards | System SR-profile insertion, audit UPDATE/DELETE/TRUNCATE rejected; explicit valid SR grant still permits operations in rollback test |
| AT-SA3-08 | One-time bootstrap credentials/logout/duplicate bootstrap | Restrictive private username CSV export COMMITTED; password change/logout work; duplicate bootstrap stops |

Verification: final 12 guarded PostgreSQL integration groups + two extra SQL/service checks PASS, nine exact history hashes/schema prerequisites verified on loopback only. Offline policy/auth/input/UI regressions are separate evidence. Initial harness 401 handling/import issues were corrected; no application authorization was weakened. Local synthetic fixtures retained because account/attendance audits are append-only. Remote migrations/bootstrap and frontend/mobile UAT are not claimed.


### Frontend navigation and scan presentation (2026-10-16)

Implemented UI changes, pending manual desktop/mobile UAT:

- Navigation separates Menu utama from Aktivitas & riwayat. SR Absensi expands to Scan kehadiran; own attendance history remains separate. Existing management/account access gates remain unchanged.
- Desktop sidebar can collapse and expand from its edge control; the authenticated header has no duplicate logo. Mobile drawer slides and retains modal focus handling. All submenus have icons and full-width hover/active backgrounds, including own attendance history. A circular mobile quick-action menu links eligible SR users to the scanner. Its icon-only shortcuts expand smoothly from the main button on an inward arc without circular outlines; radius and angular spread shrink when fewer shortcuts are selected, with Scan QR fixed and up to four optional links chosen from currently accessible menus. Preferences are scoped per account in this browser; they do not sync between devices. The settings icon opens customization and is separate from the five navigation shortcuts.
- New theme preference defaults to light; saved user preferences and explicit light/dark/system selection remain supported.
- Scanner uses the camera preview, red scan frame, and circular camera control. QR decoding remains automatic. Camera starts only on request; GPS consent and verification remain unchanged.
- Scan failure opens a retry dialog; success/already-recorded results show an informational dialog with returned event/time/classification and a success toast. No event location or schedule is invented before QR verification.
- Manual UAT must verify keyboard focus, Escape/backdrop dismissal, drawer entrance/exit animation, reduced motion, saved themes, small screens, radial-menu Escape/outside dismissal, fixed Scan QR, optional-link selection limits, per-account preference restoration and unavailable browser storage, camera permissions, GPS failures, and successful/duplicate scans on real devices.

CLI geometry coverage verifies all one-to-five navigation shortcut counts plus settings: no overlapping 52px buttons, bounds within a 320px viewport, and tighter grouping for fewer shortcuts. This is mathematical layout coverage, not rendered-device UAT.
