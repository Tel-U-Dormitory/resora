# Product Requirements Document — RESORA

**Document:** System-wide PRD | **Version:** 0.2 (synchronized working draft) | **Date:** 2026-10-10\
**Product name:** RESORA (working name; may be renamed)  
**Owner / final prioritization and release approver:** Project Manager (RnD SR)  
**Status:** **DRAFT** — NOT a blanket approval of the historic 118 functional requirements.

## 1. Product summary

RESORA is an integrated platform to support Telkom University dormitory and Senior Residents (SR) operations, with potential surfaces for dormitory information/landing pages, CoD/content, attendance, resident services, evaluations, inspections and analytics. Current product specifications are **reference proposals**, subject to module-by-module discovery.

**Problems to solve (provisional):** fragmented manual spreadsheets/forms, inconsistent attendance processes, limited traceability of approvals, and duplicated operational data. **Must validate** problem magnitude and success criteria with owners of each domain.

**Principles:** one product with separately addressed surfaces/subdomains (exact domain names TBD); one consistent identity/permission model; modular monolith before service extraction; scope and MVP set **per NEED**; backend-enforced security; privacy-by-design.

## 2. Governance and sources of truth

- PM sets feature prioritization, approves PRDs/UAT/releases for internal SR workflows.
- When a feature affects non-SR parties, the relevant stakeholder must validate scope, workflow and data rights before implementation or rollout. PM retains project prioritization.
- Original R&D planning spreadsheet has 12 stakeholder NEEDs and 118 historic FR entries; the document is **discovery baseline**, not signed-off production specification. IDs from that baseline remain useful for traceability.
- Task execution and sprint logbooks live in **other per-NEED spreadsheets**. This PRD describes the **product**, not sprint assignments.
- Decision evidence and unknowns are tracked in `docs/decisions/` and the R&D workbook. Explicit `TBD` means no approved decision.

## 3. Primary actor model

| Actor       | Description                           | Current login          | Additional dimensions                                    |
| ----------- | ------------------------------------- | ---------------------- | -------------------------------------------------------- |
| `MAHASISWA` | General student/dormitory user        | Not in NEED-001 launch | None                                                     |
| `SR`        | Senior Resident                       | Yes, NEED-001          | `position`/jabatan, **one** department, **one** building |
| `ASUS`      | Asrama operations/administration      | Deferred               | None                                                     |
| `DITMAWA`   | University administration stakeholder | Deferred               | None                                                     |

Each account has **one primary actor**, either Mahasiswa or SR etc. **Event attendance targeting is a different concept** and may logically include multiple account types. In particular, audience `ALL_STUDENTS` includes accounts whose primary actor is `MAHASISWA` **or** `SR`, without giving one account two primary roles. `KADIV` is a position filter for SR across any department.

SR departments (confirmed): HCO, Adaptif, Sosial, Akademik, Spiritual, Media and RnD. SR is associated with one department and one building; KADIV is a position. Initially only a superadmin system privilege may change SR department, position, building and active status; it is not a fifth primary actor. Assignment changes do not rewrite event publication snapshots.

## 4. Functional domains and sequencing

The following are **candidate** NEEDs, not necessarily modules with approved MVPs:

| NEED     | Candidate domain                            | Initial business owner | Sequencing / decision                                                         |
| -------- | ------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| NEED-001 | Attendance SR at internal events / meetings | HCO                    | **First deliverable:** usable SR attendance by 2026-10-18; detailed PRD below |
| NEED-002 | Sidak / inspection of residents             | Adaptif + Ditmawa      | Possible next, no date                                                        |
| NEED-003 | Sidak / inspection of SR                    | HCO                    | Possible next, no date                                                        |
| NEED-004 | Room cleanliness checks                     | Adaptif + HCO          | Possible next, no date                                                        |
| NEED-005 | SR performance / KPI                        | HCO + leadership       | Parallel development with NEED-007 to end Oct 2026; MVP TBD                   |
| NEED-006 | Facility complaints & incidents             | SR buildings + ASUS/HD | Not scheduled                                                                 |
| NEED-007 | Activities/events for general residents     | Adaptif                | Parallel development with NEED-005 to end Oct 2026; MVP TBD; reuse QR system  |
| NEED-008 | Inventory                                   | HCO                    | Possible next, no date                                                        |
| NEED-009 | CoD/content & communications                | Academic/Media         | Not scheduled                                                                 |
| NEED-010 | Student/SR feedback                         | TBD                    | Not scheduled                                                                 |
| NEED-011 | Analytics / data warehouse                  | Multi-domain / RnD     | Defer until source data stable                                                |
| NEED-012 | Dormitory landing page                      | Stakeholder TBD        | Same product; subdomain TBD                                                   |

**Core cross-cutting candidate capabilities:** Identity & Access, SR assignment data, audit log, notification (deferred/TBD), shared QR infrastructure, data export with controls. Core capabilities support NEEDs but do not constitute a separate universal MVP.

## 5. Current delivery scope (NEED-001 pilot)

**Committed intent:** on **2026-10-18**, SR should be able to use the internal event attendance system in a controlled pilot. The date does **not** imply the entire RESORA platform, NEED-005 or NEED-007 is complete.

**In scope (functional intent):**

1. Approved-provisioned SR accounts; sign-in using NIM/password; account status and HCO/KADIV authorization.
2. HCO event creation and configuration: name, start/end and configurable late threshold; audience selection SR or KADIV, future-ready `ALL_STUDENTS`; event location center and geofence radius.
3. Participant snapshots at publication; event-bound unpredictable QR displayed on the event page, static for a configurable lifetime (default six hours from activation), revocable by HCO, with explicit reissue of expired/revoked challenges using configured TTL; previous challenges stay invalid, with duplicate prevention.
4. HCO-selected map pin/latitude-longitude center and backend distance validation (default radius **20 m**, configurable); unverifiable GPS leads to KADIV HCO manual entry.
5. KADIV HCO direct manual insertion/correction with mandatory reason, overridable effective attendance time, immutable creation time and audit history; corrections preserve original attendance source. HCO recap/CSV includes all invited non-attendees; XLSX optional.
6. SR access to eligible events and personal event/attendance history.

**Explicitly not ready for general-audience production launch:** student (non-SR) logins, university SSO/API, extensive analytics, activity registration module NEED-007. Event audience `ALL_STUDENTS` must **not be represented as end-to-end available** until student accounts have login support.

QR validity permits early and after-end check-in; event end is not an automatic cutoff. Timing is separate from presence: `EARLY` before start, `ON_TIME` through configurable tolerance inclusive (default 15 minutes), `LATE` afterward. Missing attendance is pending until the attendance window closes, then absent; authorized HCO closes explicitly, invalidating active QR and reporting non-attendees as absent.

Published events allow edits to title/description only; audience/schedule become immutable. Freezing location, radius and late tolerance is **RECOMMENDED**, pending final PM confirmation.

**Detailed sources:** [NEED-001 PRD](modules/need-001/prd.md), [canonical proposed data model](modules/need-001/resora-need-001-data-model.md).

## 6. Authentication, permissions and data

- Technology: **Better Auth**; NIM login requires Username Plugin, with NIM unique and immutable after provisioning where applicable.
- No public sign-up; privileged account import/provisioning with cryptographically generated temporary passwords. Password distribution must be secure and password change required at first login (implementation design in `docs/architecture.md`).
- Every SR has a real email address. Plan Gmail SMTP, sender display name **RnD SR XIV**; sender address and SMTP credentials remain environment variables. Password recovery and email verification belong to Phase 2.
- SR account is bound to jabatan, department and building. Backend checks action-level RBAC and ownership; frontend menu restrictions are not authorization.
- HCO may create events and see/export attendance; only **KADIV HCO** inserts/corrects manual attendance, with automatic timing calculation and immutable audit. Inactive accounts cannot authenticate/check in, even if invited.
- Authorized CSV import supplies NIM, name, email, department, position, building and active status. PM delivers real CSV privately before pilot UAT; development uses synthetic accounts until then. University integration is deferred.

## 7. Non-functional requirements (draft quality gates)

| Area            | Baseline requirement                                                                                   | Acceptance target                                 |
| --------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| Privacy         | Limit access to personal attendance, locations and credentials; minimize GPS storage                   | Retention, minimization and legal permissions TBD |
| Security        | TLS in production, session cookies, CSRF/CORS strategy, auth rate limiting; audit privileged mutations | Security/UAT checks before release                |
| Integrity       | A person cannot check into an event more than once; concurrent requests safely deduplicated            | DB uniqueness + integration test                  |
| Authorization   | Per procedure and per domain action; HCO vs KADIV differences                                          | Positive/negative tests                           |
| Reliability     | Errors handled without partial writes; manual fallback when browser location denied/inaccurate         | Failure-case UAT                                  |
| Observability   | Health checks, structured error logs, audit for attendance corrections                                 | Operational baseline set before pilot             |
| Backup          | Postgres backups and restore strategy before production                                                | Schedule/retention TBD                            |
| Accessibility   | Mobile-first scan flow, permission/error messages and keyboard navigation                              | Mobile browser UAT                                |
| Performance     | Check-in responsive during simultaneous meeting arrivals                                               | Concurrency/latency numerical target TBD          |
| Maintainability | TS strict, reusable domains, Biome, repeatable migrations, tests                                       | CI and review policy TBD                          |

## 8. Product success, not just feature output

Pilot outcomes to measure (numeric targets **TBD**): SR invited/eligible vs checked-in, successful QR scans, failed GPS scans, manual insertions/corrections, duplicate rejection, time to complete manual entry, and user-reported friction. No metric can be interpreted as a validated target before PM/HCO sets it.

## 9. Main dependencies and risks

- **OPEN:** Cancellation/reopening lifecycle, geofence-freeze safeguard and manual override bounds still need HCO/PM decisions; timing, QR lifetime default, snapshots and direct manual workflow are confirmed.
- **BLOCKER:** SR identity input and safe credential distribution; exact SR building/position data.
- **IMPLEMENTATION GATE:** Verify confirmed KADIV HCO permissions, publication snapshots and live inactive-account rejection with positive/negative tests.
- **RISK:** Browser GPS inaccurate or spoofed, especially with 10–20 m radius; treat as signal, not proof of physical presence.
- **RISK:** Security exposure if event QR token can be replayed/shared or authorization is done only client-side.
- **RISK:** Target 2026-10-18 leaves a short UAT and rollout window; MVP must remain narrow.
- **DEFERRED:** University SSO and institutional data/API; future CoD/site subdomains.

## 10. Acceptance and release governance

An individual module is ready for release only when its scoped requirements have verifiable acceptance criteria, auth and permission tests pass, database migrations/rollback and backup approach are recorded, manual fallback is validated, and PM approves UAT/release. Need-001-specific cases: `docs/modules/need-001/acceptance-tests.md`.

## 11. Open decisions that must not be fabricated

1. Cancellation/reopening/republication lifecycle and any snapshot handling; confirm the recommended location/radius/late-tolerance freeze.
2. GPS accuracy threshold and permitted radius range after field testing; configurable QR TTL/grace bounds.
3. Manual effective-time override bounds and backdated entry for now-inactive invitees.
4. Actual roster/building/position values, CSV header validation/mapping and secure initial credential delivery.
5. Gmail sender configuration and recovery/verification operational policy in Phase 2.
6. Lateness-duration basis/rounding, export filters/logging, privacy/retention and backup targets.
7. Actual deployment origins/subdomains, cookie configuration, VPS/budget approval and operational targets.
8. Numerical pilot-success criteria and UAT participants.

Confirmed technical baseline: pnpm **10.33.4**, Bun **1.3.13** backend runtime, Next.js/Express/tRPC, Better Auth, Drizzle, Varlock, Supabase managed PostgreSQL through Express only. Runtime `DATABASE_URL` is Session Pooler; migration tooling prefers `DIRECT_DB_URL` without silent failure fallback. Local Docker PostgreSQL is optional; VPS deployment planned. Phase 2A now defines auth username fields and the six identity tables; Phase 2A.5 validated the generated migrations locally; Supabase application remains pending explicit approval. Login UI, signup/active-account enforcement, provisioning and the rest of NEED-001 remain later work; infrastructure/schema definitions do not establish pilot readiness.

## 12. Document map

- Architecture: `docs/architecture.md`
- NEED-001 detailed PRD: `docs/modules/need-001/prd.md`
- NEED-001 acceptance: [tests](modules/need-001/acceptance-tests.md)
- NEED-001 canonical data model: [schema specification](modules/need-001/resora-need-001-data-model.md)
- NEED-001 execution roadmap: [roadmap](modules/need-001/roadmap.md)
- Decision records: `docs/decisions/`
- Setup checklist: `docs/setup.md`
- Agent instructions: `AGENTS.md`
