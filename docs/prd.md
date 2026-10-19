# Product Requirements Document — RESORA

**Document type:** System-wide Product Requirements Document  
**Version:** 0.3 — aligned with decisions through 2026-10-11  
**Product:** RESORA (working name)  
**Owner and final prioritization/release approver:** Project Manager, RnD Senior Residents  
**Status:** Working product baseline. Business rules explicitly identified as _PM-confirmed_ are agreed for planning; stakeholder UAT, deployment approval, and unvalidated modules remain pending.

> **Document boundary:** This PRD answers **what RESORA must do, for whom, under whose authority, and in what delivery scope**. Detailed folder structures, code boundaries, API patterns, transaction design, schema constraints, and environments belong in [Technical Architecture](architecture.md). Detailed business workflows and test cases belong in each module PRD and acceptance-test specification.

**SA-01 PM decision (2026-10-13):** An active, eligible SR with an explicit database SUPERADMIN grant has all existing cross-department operational and system-administration permissions. This supersedes earlier no-operational-bypass clauses, including dated Phase 4 notes. No privilege is inferred from department/position; authentication, mandatory password change, valid assignment, resource lifecycle, invitation/target eligibility, integrity and audit still apply. Existing department policies remain unchanged for users without the grant.

**SA-03 final PM decision:** The first SUPERADMIN is a newly bootstrapped dedicated `SYSTEM_ADMIN`, never an elevated existing SR or a fabricated SR assignment. Login accepts SR NIM or administrative username through the same Better Auth flow. Both require active identity and mandatory password change; SYSTEM_ADMIN additionally requires a current explicit SUPERADMIN grant. SYSTEM_ADMIN has cross-department operational/admin permissions but is excluded from SR roster, attendance targets, QR check-in and own SR history. Explicit valid SR SUPERADMIN grants retain SA-01 behavior. Earlier SR-only login/first-admin assumptions are superseded; Production bootstrap still requires separate approval.

**Administrator lifecycle update approved (2026-10-19):** Instant cached account search, audited SR password reset with mandatory rotation after reset, period membership/renewal and access expiry with preserved history are approved. Dedicated SYSTEM_ADMIN is exempt from SR tenure expiry. See [module requirements](modules/need-001/prd.md#approved-administrator-account-lifecycle-update-2026-10-19).

## 1. Product overview and objectives

RESORA is an integrated digital platform for operations and services related to the Telkom University dormitory and Senior Residents (SR). Its candidate domains include internal SR attendance, student activities, inspections, resident services, SR performance, inventory, content/CoD, feedback, and analytics. Public landing pages, content delivery, and management interfaces may use distinct subdomains within the same product; final hostnames remain undecided.

**Problems to address:** fragmented forms and spreadsheets, inconsistent operational records, limited traceability of changes and decisions, duplicate manual processes, and access to information that is not consistently controlled. The magnitude of each problem, numerical targets, and non-SR workflow details require validation by the respective domain owner.

**Product principles:** one coherent identity and permission model; modular ownership; reuse common capabilities rather than copying features; server-enforced authorization; privacy by design; explicit audit of sensitive mutations; independent scope and release acceptance **per NEED**, not a blanket release of every historical feature.

**Out of current commitment:** full deployment of all 12 NEEDs, institutional single sign-on/API integration, general non-SR student/staff logins (dedicated SYSTEM_ADMIN is explicitly approved by SA-03), analytics warehouse, and other features without approved module scope.

## 2. Governance and sources of truth

- The Project Manager (PM) sets sequencing, resolves cross-module conflicts, and approves release. Owners affected by a feature must validate their workflow, permissions, and data access before stakeholder UAT or rollout.
- The RESORA master workbook is the register of **NEED IDs, official FR IDs, priority labels, ownership, dependencies, and decisions**. The synchronized 2026-10-11 baseline has **12 NEEDs, FR-001–FR-134 (134 FRs), and 27 backlog items**. Historical priority/release labels do **not** automatically constitute approved MVP scope.
- This system-wide PRD covers product-wide rules and capability boundaries. Individual module PRDs describe approved feature behavior; acceptance documents describe testable outcomes; Architecture describes technical realization; ADRs preserve decisions and rationale.
- Change control requires aligning the master FR, affected PRD, acceptance criteria, Architecture/data-model references, and ADR before development of the changed feature. Never use a stale module document to override a later explicit PM decision.

**Decision terminology**

| State            | Meaning                                                                                |
| ---------------- | -------------------------------------------------------------------------------------- |
| **PM-confirmed** | Business rule approved by PM; does not mean implemented or signed off by domain owner. |
| **Proposed**     | Technical approach or policy recommendation subject to review.                         |
| **Implemented**  | Code or migration exists; no promise of end-to-end correctness.                        |
| **Validated**    | Required tests/UAT have passed with recorded evidence.                                 |
| **Released**     | Deployment, operations and PM approval completed.                                      |
| **TBD**          | Must not be invented by the implementation team.                                       |

## 3. Primary actors and permission model

| Primary actor | Role in RESORA                                          | Login readiness                                                          |
| ------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `SR`          | Senior Resident and internal operational departments    | NIM/password, first-password-change and synthetic CSV provisioning tested locally; real import/UAT pending. |
| `MAHASISWA`   | Student/dormitory user, including eligible new students | Required for NEED-007 later; login mechanism/provisioning not finalized. |
| `ASUS`        | Dormitory operational/administrative stakeholder        | Deferred.                                                                |
| `DITMAWA`     | University administration stakeholder                   | Deferred.                                                                |

A user has **exactly one primary actor**. Every SR has one department, one position/jabatan, and one building assignment. Departments include INTI plus the seven existing departments; see the canonical organization dictionary. `KADEP` is a position, not an actor; **Inti** means department `INTI`; executive positions belong only to INTI and non-INTI departments accept KADEP/SEKDEP/ANGGOTA. `SUPERADMIN` is an explicitly granted system privilege, **not** an actor or an automatic benefit of RnD membership. SA-03 adds the distinct primary actor `SYSTEM_ADMIN` for a new dedicated administrative account: no NIM/SR profile/organization assignment, and no SR participant rights. Only users granted that privilege may maintain SR department/position/building/active status, with audit. SA-01 grants eligible active SUPERADMIN cross-department operational access, including HCO/KADEP HCO and Adaptif policies; resource lifecycle, invitation/target validation and audit remain mandatory.

Phase 3 uses the [canonical organization codes and authorization matrix](modules/need-001/resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries): 8 departments, 7 positions and 18 separate TEXT-coded buildings. PM approved **KADEP replacing KADIV** for new data/policies; no input alias or automatic legacy conversion. Policy foundations and local seed are implemented/tested; Phase 4 internal event/session/QR endpoints are implemented; attendance records and identity-admin UI remain deferred.

Backend authorization must verify active account, actor, department, relevant position, permission, and resource context on every protected action. Hiding a UI control is not access control.

## 4. Module ownership and responsibility boundaries

| Area                                                     | Business/data owner                | Operational authority                                                                                                    | Exclusions / guardrail                                                                                             |
| -------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Core Identity / SR directory (`MOD-01`)                  | RnD with authoritative data source | Explicitly privileged administrators for SR assignments                                                                  | Membership in RnD alone grants no `SUPERADMIN` rights.                                                             |
| Internal SR events and attendance (`NEED-001`, `MOD-03`) | **HCO**                            | Authorized active HCO members: create event, select audience, QR/session, geofence, recap/CSV                            | No general-student event attendance operations.                                                                    |
| Manual insertion/correction for internal SR              | **HCO**                            | **KADEP HCO or explicit eligible SUPERADMIN**, mandatory reason and audit                                                                           | Without explicit SUPERADMIN, ordinary HCO, KADEP of another department, and Adaptif cannot perform these actions.                               |
| General activity registration (`NEED-007`, `MOD-06`)     | **Adaptif**                        | Authorized Adaptif management of registration, quotas and cancellation                                                   | Rights to create activities for other departments remain a separate, unconfirmed policy.                           |
| General activity attendance (`NEED-007`, `MOD-03`)       | **Adaptif**                        | **All authorized Adaptif operators**: configure location/radius, activate/close session, QR, manual insertion/correction | HCO has **no role** in these attendance sessions; KADEP status is not required for an authorized Adaptif operator. |
| SR KPI/performance (`NEED-005`, `MOD-07`)                | HCO and SR leadership              | Specific assessment permissions TBD                                                                                      | Attendance does not automatically determine KPI scoring.                                                           |

Attendance data has a **contextual owner** although its implementation is shared. Domain ownership is not interchangeable with technical custody by RnD.

## 5. Functional domains and delivery sequence

The following are candidate product NEEDs; their owners, scope, and status are not uniformly approved.

| NEED       | Candidate capability                                   | Initial owner         | Current scope/delivery statement                                                       |
| ---------- | ------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------- |
| `NEED-001` | Digital attendance for **internal SR meetings/events** | HCO                   | **First implementation focus; PM-confirmed feature rules**, HCO UAT pending.           |
| `NEED-002` | Resident inspection/sidak                              | Adaptif + Ditmawa     | Further stakeholder validation.                                                        |
| `NEED-003` | SR inspection/sidak                                    | HCO                   | Further stakeholder validation.                                                        |
| `NEED-004` | Room cleanliness checks                                | Adaptif + HCO         | Further stakeholder validation.                                                        |
| `NEED-005` | SR KPI / 360 evaluation                                | HCO + leadership      | Planned subsequent/parallel candidate; scoring and privacy rules TBD.                  |
| `NEED-006` | Facility complaints/incidents                          | Building SR + ASUS/HD | Not scheduled; handler/approval details TBD.                                           |
| `NEED-007` | Activity events, registration, quotas and attendance   | Adaptif               | PM-confirmed registration and attendance rules; student login and Adaptif UAT pending. |
| `NEED-008` | Inventory                                              | HCO                   | Not prioritized for current pilot.                                                     |
| `NEED-009` | CoD, content and communication                         | Akademik/Media        | Ownership/workflow details require validation.                                         |
| `NEED-010` | Feedback from residents/SR                             | TBD                   | Need discovery.                                                                        |
| `NEED-011` | Cross-domain reporting/analytics/data warehouse        | Multiple owners/RnD   | Data contracts first; full warehouse deferred.                                         |
| `NEED-012` | Dormitory public landing page                          | TBD                   | One platform; public subdomain design TBD.                                             |

Core reusable capabilities include identity/RBAC, verified SR roster, notifications (TBD), attendance sessions/QR/geofencing, auditing and controlled exports. They do not constitute one mandatory product-wide MVP.

## 6. Shared attendance capabilities and business workflows

**Three distinct concepts:**

- **Event:** an activity, its owner, schedule and eligibility source.
- **Attendance session:** when and under which location/QR policy check-in is accepted. This is **not** an authentication/login session.
- **Attendance record:** a participant's actual recorded attendance for a particular session.

**Shared behavior:** backend authentication and eligibility checks, explicit session activation/closure, verifiable QR, geofence policy, duplicate-safe check-in, timing classification where applicable, immutable privileged audit, and reporting. **One attendance engine** serves NEED-001 and NEED-007 without granting HCO permission over Adaptif data or vice versa.

### 6.1 NEED-001 — internal SR attendance

HCO creates an internal event and constructs its audience in **composable “lego” fashion**: all active SR; one or more departments; all **KADEP across departments**; chosen individual members; or any combination. **Inti** selects department INTI; **Inti + KADEP** unions INTI with KADEP from the seven other departments. Group filters use UNION; explicit exclusion wins over inclusion. HCO may add or remove individuals from the **draft preview**, and a final deduplicated **participant snapshot** is stored atomically when the event is published. This invitation gives the SR the **right to check in**, not an automatic `PRESENT` record. Changing a user's later department/position does not rewrite the invitation history. Edit/remove after **publication** is **not yet authorized** and requires a separate amendment policy.

Authorized HCO manages event, QR, radius, reporting and explicit closure. The initial NEED-001 event has **one attendance session**, distinct from event publication/schedule and login sessions. QR challenges belong to that session; shared attendance uniqueness is **`(session_id, user_id)`**. Explicit HCO event closure closes its session and invalidates the QR atomically. Phase 4 uses an internal-only UNIQUE NOT NULL session FK to Attendance-owned events. Create event/session atomically, session initially INACTIVE; publish does not activate it. There is no standalone close-session endpoint/UI. Future Activity binding is deferred; no shared registry is created. Confirmed defaults and rules:

| Rule                      | NEED-001 baseline                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| QR                        | Static, unpredictable, session-bound with validated event/context association; default **6 hours from activation**, configurable, revocable/reissuable explicitly; no automatic rotation.              |
| Geofence                  | HCO selects Dorm Hall (latitude **-6.9712891**, longitude **107.628339**) by default or places/drags a pin on the provided map; existing event coordinates are preserved when editing. HCO sets radius; **20 m default**, configurable. Backend calculates distance; browser GPS is untrusted. Phase 5 initially requires accuracy <=20 m (one backend constant); radius is configurable only in DRAFT and frozen at publication.                                     |
| Check-in time             | Scan allowed **before scheduled start and after scheduled end**, as long as session and QR are still active/valid.                                                  |
| Timing                    | `EARLY` before start; `ON_TIME` from start through start + grace **inclusive**; `LATE` afterward; **15-minute default grace**.                                      |
| Manual entry / correction | **KADEP HCO or explicit eligible SUPERADMIN**, mandatory reason, overridable effective `attendance_at`, immutable `recorded_at`, preserved original source and append-only before/after audit. |
| Presence                  | Record exists → `PRESENT`; missing record → `PENDING` until HCO explicitly closes event, then `ABSENT`. Expired QR/end of schedule alone does not close event.      |
| Reports                   | HCO sees and exports **every invited SR**, including pending/absent; CSV required, XLSX optional; SR sees only own event/history.                                   |

If location access is denied, inaccurate, or out of range, there is no automatic bypass; SR must contact KADEP HCO for auditable manual handling. Only title/description are editable after publishing; roster, schedule and all session configuration (center/radius/grace/TTL) are frozen by final PM decision.

The **official NEED-001 FR set** is `FR-086` (recap) and `FR-119–FR-130` (event, audience builder, snapshot, QR, check-in, geofence, manual, audit and CSV). Detailed scenarios: [NEED-001 PRD](modules/need-001/prd.md) and [acceptance tests](modules/need-001/acceptance-tests.md).

### 6.2 NEED-007 — Adaptif activity registration and attendance

Adaptif configures the event registration form with a **positive maximum capacity** or **unlimited** capacity. A successful registration immediately establishes attendance eligibility **while not cancelled**; there is **no confirmation/approval step required** for eligibility. When a limited-capacity event is full, new registrations are **rejected automatically**, not accepted into an implicit waitlist. A cancellation releases a slot for new applicants **if registration is still open**. Concurrent requests must not exceed capacity.

A participant (mahasiswa/maba, or another eligible RESORA user including SR) **must log in** and have an **active successful registration** to check in. Authorized **Adaptif** operators alone set session location/radius and manage QR/session and manual insertion/correction, with mandatory reason and audit. HCO does not take part. Attendance uses **the same MOD-03 engine**, but eligibility comes from the **MOD-06 registration domain**, not an SR invitation snapshot. The exact student onboarding/login flow and module-wide event-creation permissions remain to be specified before NEED-007 release.

Applicable existing activity FRs include `FR-040`, `FR-042–FR-047`, with Adaptif-specific session/manual FRs `FR-133–FR-134`. NEED-007 is **not** implicitly included in the NEED-001 pilot deliverable.

## 7. Current delivery scope, milestones and implementation state

The earlier plan identifies **2026-10-18 as a target for a controlled NEED-001 pilot**. Treat this as a **planning target**, not evidence that release is feasible or approved; reassess scope, readiness and UAT against actual team capacity before committing.

| Capability                                                                            | Current known state                                                                              | Next gate                                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Next.js/Express/tRPC monorepo and technical scaffold                                  | Present in repository                                                                            | Keep builds, lint/type-check and configuration stable.                          |
| PostgreSQL/Drizzle identity foundation                                                | **Three reviewed migrations applied and verified on Supabase Development** (Phase 2A/2A.5/2A.6). | Do not modify applied identity migrations without reviewed follow-up migration. |
| Better Auth SR sign-in (NIM/password), active checks, no-public-signup and first-password-change enforcement | **Implemented; synthetic local HTTP/browser validation passed in Phase 2B** | Review [implementation evidence](modules/need-001/resora-need-001-data-model.md#16-phase-2b-sr-authentication); pilot UAT still required. |
| Internal CSV SR provisioning | **Implemented/tested locally with synthetic data in Phase 2C** | Dry-run/apply, Better Auth hashing, private credentials export; real imports/distribution require approval. |
| Email recovery/verification | **Pending** | Gmail SMTP and operational delivery are outside Phase 2C. |
| NEED-001 event, roster builder, attendance sessions, QR, geofence and reporting       | **Phase 4/4.5 PM accepted; Phase 5/6 Development verified; Phase 7 quality review**                                          | Event/session/QR/check-in implemented; Phase 5 applied by PM to Development and PostgreSQL verified with stated profile/mobile UAT limitations. Phase 6 manual/audit/recap/history/CSV migrated and verified on Development (17 PostgreSQL groups including five concurrency cases), with live-profile/role combinations and frontend/mobile UAT still pending.          |
| NEED-007 student login, quotas, registration and Adaptif attendance                   | **PM-confirmed business rules, not delivered**                                                   | Separate module specification and Adaptif UAT.                                  |
| Production VPS and full product release                                               | **Planned, unverified**                                                                          | Security, backup, deployment, operations and PM go/no-go.                       |

**No database migration or production action is authorized merely by this PRD.** Migration review and explicit approval are required; local disposable DB tests and Supabase Development must be clearly distinguished from production.

**Phase 5 PM decision (2026-10-12):** successful QR check-in stores one latitude/longitude/accuracy measurement as DOUBLE PRECISION on the attendance record. Failed scans and continuous location history are not stored. Explain this before GPS permission. Raw GPS is excluded from general responses, recaps and exports; dedicated audit access and retention require decisions before Production/real pilot. Manual attendance GPS is nullable. Initial maximum accuracy is 20 m, tunable to 30 m through one backend constant after UAT.

**Phase 6 PM final decisions:** KADEP HCO alone may insert/correct/audit attendance on PUBLISHED with INACTIVE/ACTIVE session or CLOSED/CLOSED, never DRAFT. Effective time must be <= server now and, for CLOSED, <= events.closed_at; CLOSED insertion requires explicit time. No scheduled-end cutoff or extra backdate window. Existing records of inactive historical invitees may be corrected, but new inactive/ineligible insertion is denied. Preserve original recorded_at, source, recorded_by_user_id, initial manual_reason and GPS; update only attendance_at/timing_class/updated_at and append mandatory-reason before/after audit atomically. Manual operations cannot reopen event/session/QR or change snapshots/frozen policy.

HCO recap/CSV starts from every invitation snapshot LEFT JOIN records by session/user. Presence is derived PRESENT/PENDING/ABSENT, with missing time/timing/source/duration NULL. Lateness is max(0, ceil(minutes after grace)), zero for EARLY/ON_TIME. Own history is session-user-only with bounded pagination, no arbitrary userId. UTF-8 CSV uses quoting/formula defense, an apostrophe text marker retaining NIM leading zeros without formulas, WIB timestamps and blank missing fields. No raw GPS, credentials or internal audit JSON. GPS/audit/export retention and export-access audit remain release decisions. See the canonical data model section 21 for implementation/verification limits.

## 8. Authentication, authorization and data governance

- Use Better Auth with Username Plugin for SR login via **NIM/password**. Preserve NIM formatting, including leading zeros; NIM is not a numerical counter.
- **Public account registration is prohibited** for the SR pilot. Privileged import/provisioning is based on a validated CSV with NIM, name, real email, department, position, building and active status, using a secure first-credential delivery process.
- First-login password change, authenticated sessions, disabled-account rejection and password recovery using real email are required. SMTP sender display name is planned as **RnD SR XIV**; mail credentials remain server-side. Student identity/login needed for NEED-007 is a later separate readiness gate.
- Consent/privacy and data minimization govern personal identities and GPS; never expose password hashes, QR secrets, session tokens or raw GPS in general exports.
- Privileged changes (assignment, manual presensi, correction and relevant exports) must be traceable; the person who records/corrects and the effective attendance time are distinct facts.
- Business data ownership must be respected across modules even if technical administration of the database is centralized.

## 9. Non-functional requirements and minimum quality gates

| Quality area    | Required behavior                                                                                                                         | Remaining acceptance target                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Security        | Server-side RBAC/eligibility, TLS in production, secure session cookies, CSRF/CORS/trusted-origin policy, rate limiting, secret isolation | Security test plan and operational configuration pending.     |
| Data integrity  | Atomic event publication/snapshot, duplicate-safe attendance, quota reservation/cancellation, append-only correction audit                | Concurrent integration tests with test database.              |
| Privacy         | Least privilege, no secrets or raw GPS in CSV, controlled access to high-sensitivity attendance and account data                          | Retention, legal notice and audit access TBD.                 |
| Reliability     | Clear failures for revoked/expired QR, denied location, unavailable DB, and rejected registration                                         | Error-case UAT and recovery targets TBD.                      |
| Accessibility   | Mobile-first QR scan, permission prompts, error recovery, usable forms and keyboard access                                                | Browser/mobile acceptance matrix TBD.                         |
| Performance     | Arrival bursts and concurrent registrations must not corrupt data                                                                         | Numeric latency/load objective TBD.                           |
| Observability   | Health checks, structured backend errors, audit correlation and incident response                                                         | Logging, redaction and alerting policy TBD.                   |
| Maintainability | TypeScript strict, domain separation, tested services, repeatable reviewed Drizzle migrations, automated quality checks                   | CI/reviewer policy TBD.                                       |
| Recoverability  | Tested PostgreSQL backup/restore and reviewed migrations                                                                                  | Backup frequency, RPO/RTO, rollback/forward-fix strategy TBD. |

## 10. Product success metrics

For NEED-001, capture **invited SR count**, successful QR attendance, GPS failures, manual entry/correction counts, duplicate rejections, percent of missing/pending attendees at event close, and time needed to produce an accurate CSV. For NEED-007, later measure active registration count versus capacity, full-capacity rejections, cancellations/reopened slots, attendance eligibility failures and successful check-ins. Aggregates must not bypass authorization to individual records.

**No numerical target is yet approved**; PM and the corresponding owner establish targets and UAT sampling before release. KPI/character points must not automatically infer outcomes from attendance data without a separately approved policy.

## 11. High-level technical architecture and repository policy

RESORA follows a **TypeScript modular monolith** with Next.js frontend, Express backend (Bun runtime), tRPC boundary, Better Auth, PostgreSQL/Drizzle and shared packages. The **directory standard** is:

- **Frontend:** Next.js — thin route/layout structure in `apps/web/src/app/`, feature/domain-owned implementation in `apps/web/src/features/`, genuinely reusable presentation components in shared locations.
- **Backend:** thin runtime in `apps/server/`, feature/domain-owned tRPC routers, services, repositories, input schemas, access policies and tests in `packages/api/src/modules/`.
- **Data and cross-cutting packages:** Better Auth in `packages/auth`, Drizzle schema/migrations in `packages/db`, reused UI primitives in `packages/ui`, and shared configuration in `packages/config`.

**This is a target development standard, not an assertion that all folders already exist.** Folder trees, import boundaries, dependency direction and conventions are specified in [Technical Architecture §3–5](architecture.md); the PRD does not maintain a per-file repository inventory.

## 12. Dependencies, risks and constraints

- **Identity readiness:** NEED-001 requires login, active SR status, approved organization assignments and roster, and correct HCO/KADEP/SUPERADMIN permissions before pilot UAT.
- **Cross-domain attendance:** MOD-03 consumes eligible SR snapshot for NEED-001 or valid MOD-06 registration for NEED-007. Sharing an engine **does not** share its operators.
- **GPS reliability:** browser location can be inaccurate or spoofed; particularly sensitive for short distances/indoor use. Manual fallback must remain auditable.
- **QR security:** static tokens can be forwarded; authenticated identity, server-side eligibility, session state and short expiry are mandatory checks.
- **Roster consistency:** snapshots prevent historical rewrites, but late participant changes after publication need a separate audited policy.
- **Timeline/team capacity:** implementation and real UAT cannot be inferred from an aspirational date or a complete PRD.
- **External dependencies:** official university API/SSO integration, initial roster source, mail delivery, VPS budget and operations remain separate readiness issues.

## 13. Acceptance, UAT and release governance

A NEED is ready for owner validation only when its official FRs map to verifiable test cases, negative permission tests pass, critical state transitions and concurrent operations are tested, data integrity is checked against the real user workflow, and privacy/security behavior is reviewed. A release additionally needs approved migration/recovery steps, backup/restore verification, operational ownership and PM sign-off.

**NEED-001 UAT** must cover HCO's combined participant builder and snapshot, QR validity and session activation, distance checks, start/grace timing boundaries, duplicate scans, inactive/not-invited SR, KADEP-only manual changes with audit, explicit closure, and CSV including non-attendees. **NEED-007** has an independent Adaptif acceptance gate for successful/uncancelled registrations, quota concurrency, returned slots, login, Adaptif-only session control and manual audit.

## 14. Requirements traceability and change control

**Canonical traceability:** `Stakeholder NEED → FR Master → module PRD → acceptance scenario → implementation/test → UAT evidence → release decision`.

When a rule changes: (1) record the PM/owner decision and affected NEED, (2) update existing FR rather than duplicating it where possible, (3) update any affected module PRD/acceptance tests, (4) update Architecture, data-model and ADR **if the solution boundary changed**, and (5) confirm old text is marked superseded or removed before handing over work. Do not delete a valid FR merely because the technical implementation is shared; use a correct `Related Module` and stakeholder-need mapping.

Official reference for SR attendance: **FR-086 and FR-119–FR-130**. Core dependencies: **FR-001, FR-094–FR-096, FR-101, FR-131–FR-132**. NEED-007 activity attendance: **FR-044–FR-047 and FR-133–FR-134**, alongside activity registration/quota FRs. Actual implementation progress is tracked separately from approval of these requirements.

## 15. Open decisions (do not infer answers)

1. **NEED-001:** future invitee amendment/cancel/reopen policy; none is implemented in Phase 4. INTI membership and publication freeze of all session configuration are final.
2. **Location and manual attendance:** permissible radius range, GPS retention and dedicated audit access, audit/export retention/access and export-access logging; Phase 6 effective-time bounds/lateness rounding confirmed.
3. **Identity:** complete real SR roster, secure first-credential handoff, operational password recovery/SMTP, and login/provisioning for mahasiswa/maba.
4. **Shared attendance architecture:** future Activity-to-session parent reference and registration consistency. Phase 4 internal event ownership, exactly-one session and close-event-only lifecycle are final; no universal cross-module FK is selected.
5. **NEED-007:** creation privileges for activities outside Adaptif, full module MVP/UAT policy, and configurable registration-window edges; **capacity, cancellation and immediate eligibility rules are already confirmed**.
5. **Product/release:** NFR numerical thresholds, privacy retention, physical hosting/domains, budgets, backup targets, UAT participants and release dates.
6. **Other NEEDs:** domain-specific stakeholder workflows, permissions, scoring and data rights remain unapproved unless separately documented.

## 16. Document map and handover references

| Reference                                             | Role                                                                                                                                               |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/prd.md`                                         | This system-wide business/product baseline.                                                                                                        |
| `docs/architecture.md`                                | Implementation architecture, target FE/BE folder conventions, data boundaries, environments.                                                       |
| `docs/modules/need-001/prd.md`                        | Detailed HCO/SR attendance behavior; must use the revised version aligned with this PRD.                                                           |
| `docs/modules/need-001/acceptance-tests.md`           | NEED-001 roster/session scenarios and historical identity test evidence; unbuilt domain scenarios await implementation/UAT.                                                  |
| `docs/modules/need-001/resora-need-001-data-model.md` | Canonical roster-builder and session-based domain proposal; Phase 4 internal binding is implemented; future Activity binding and listed later policy gates remain open. |
| `docs/modules/need-001/roadmap.md`                    | Sequencing and module work plan.                                                                                                                   |
| `docs/decisions/`                                     | ADR and historical decisions; obsolete assumptions must be superseded explicitly.                                                                  |
| `docs/setup.md`                                       | Verified local setup and technical commands.                                                                                                       |
| `AGENTS.md`                                           | Repository assistant/developer instructions.                                                                                                       |
| **RESORA MAIN DOCUMENT**                              | Official FR and NEED registry, ownership, product backlog and change notes.                                                                        |

**Handover rule:** The PRD, detailed NEED PRD, Architecture, FR Master and acceptance tests must agree before beginning attendance-domain migrations or event feature implementation. A document update does not change source code or authorize deployment.

**Phase 4 PM FINAL (2026-10-11):** roster/schedule and center/radius/late-grace/QR TTL are immutable after publication; only title/description may change. HCO manages internal events regardless of creator; non-HCO can view only published events inviting them. INTI and explicit SUPERADMIN grant no HCO operational bypass. No cancel/reopen/republish, scanner, attendance record or export is delivered in this phase.
