# RESORA — Technical Architecture (Draft)

**Status:** Proposed design baseline | **Date:** 2026-10-10  
The Better-T-Stack 3.44.3 scaffold now exists (`bts.jsonc`). Phase 1 uses Supabase Development PostgreSQL through Express/Drizzle, with optional local Docker PostgreSQL. Product rules below reflect confirmed decisions; domain tables and service contracts remain proposed. Phase 2A defines generated username fields and six identity tables alongside Better Auth core tables; Phase 2A.5 applied and validated the chain on disposable local PostgreSQL 18.3; Phase 2A.6 applied and verified the unchanged chain on Supabase Development (Session Pooler 5432, PostgreSQL 17.11); see the model’s migration record. Event/QR/attendance definitions and auth UI/provisioning/enforcement are still future work. See the [canonical data model](modules/need-001/resora-need-001-data-model.md) for compatibility review.

## 1. Approved technical choices

| Layer                     | Choice                                        | State                                           |
| ------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Frontend                  | Next.js + TypeScript                          | PM-approved direction                           |
| Backend                   | Express.js + TypeScript                       | PM-approved direction                           |
| Backend runtime           | Bun 1.3.13                                           | Retained during package-manager migration       |
| Package manager           | pnpm 10.33.4                                  | Confirmed migration from Bun package management |
| API                       | tRPC                                          | PM-approved direction                           |
| Database                  | Supabase managed PostgreSQL                                    | PM-approved direction                           |
| ORM & schema/migrations   | Drizzle                                       | PM-approved                                     |
| Authentication            | Better Auth                                   | Username Plugin enabled; auth flows pending |
| App hosting               | VPS; Docker images/Compose for web and server | Planned; host/funding TBD                       |
| Workspace                 | pnpm workspaces + Turborepo                   | Existing package layout retained                |
| Lint/format               | Biome                                         | Recommended scaffolding option                  |

The recorded scaffold command and Phase 1 verification steps are documented in `docs/setup.md`; production release readiness remains unverified.

## 2. High-level logical architecture

```text
                      Browser/mobile (SR/HCO)
                                |
                           HTTPS / TLS
                                |
                      Reverse proxy (VPS)
                         /           \\
                   apps/web       apps/server
                   Next.js         Express + tRPC + Better Auth
                         \           /
                    domain services / authorization
                               |
                packages/api / packages/auth / packages/db
                               |
                PostgreSQL (Supabase / optional local)
```

Client-only UI restrictions are not authorization; enforce access in tRPC procedures/services. Plan a modular monolith; do not introduce microservices unless load/team architecture justifies them.

### Actual monorepo directories

```text
resora/
├── AGENTS.md
├── apps/
│   ├── web/           # Next.js, UI and tRPC client
│   └── server/        # Express, tRPC routing and auth endpoints
├── packages/
│   ├── api/           # shared router and context infrastructure
│   ├── auth/          # Better Auth config (location may differ)
│   ├── db/            # Drizzle tables/migrations/query helpers
│   ├── config/        # shared TS/env/tool configuration
│   └── ui/            # generated shared UI package
├── docs/
│   ├── prd.md
│   ├── architecture.md
│   ├── setup.md
│   ├── decisions/
│   └── modules/need-001/
├── turbo.json
└── docker-compose.yml
```

The exact generated package tree may vary with Better-T-Stack version. Prefer generated conventions; no unnecessary rewiring on day 1. Official generator structure: https://www.better-t-stack.dev/docs/project-structure

## 3. Domain boundaries

| Domain        | Responsibility                                                                | Initial need               |
| ------------- | ----------------------------------------------------------------------------- | -------------------------- |
| Identity      | auth users, sessions, initial credentials, disable accounts                   | shared core                |
| SR Directory  | actor, position, department/building association, active membership           | shared core                |
| Event         | event metadata, schedule, audience policy, location/radius and late threshold | NEED-001, extensible later |
| QR Challenge  | activate, display, revoke and verify static event challenge                   | reusable NEED-001/007      |
| Attendance    | record, compute classification, concurrency, report                           | NEED-001-specific adapter  |
| Manual Entry  | KADIV HCO insertion/correction, effective time and audit                          | NEED-001                   |
| Audit         | privileged modifications, exports, correlation IDs                            | cross-cutting              |

Avoid `qr.generateAttendance` as a universal service. Prefer reusable primitives such as `qr.issueChallenge({subjectType,subjectId,...})` (typed domain-specific policies); attendance services own eligibility and time windows.

## 4. Authentication, provisioning and permission model

- Only `SR` logins for pilot; public sign-up **disabled**, not just hidden.
- Better Auth Email+Password with Username Plugin: `username=NIM`, `signIn.username(...)`; plugin requires an **email during user creation**. Every SR supplies a real email. Plan Gmail SMTP with sender display name `RnD SR XIV`; sender address/SMTP credentials remain environment variables. Password recovery and email verification are Phase 2 work.
- Authorized CSV import uses NIM, name, email, department, position, building and active status. Real CSV arrives privately before pilot UAT; use synthetic development accounts meanwhile. Validate unique NIM/email, preserve NIM leading zeros and validate assignments.
- Generate temporary passwords with cryptographic randomness and sufficient entropy; deliver via a secure one-time mechanism. Store hashes through Better Auth only; do not log/commit/export plaintext passwords.
- First-login password change is a security requirement; verify if generator/auth plugin provides such enforcement, otherwise implement explicit app-level gate.
- Account has one **primary actor**. Actor (`SR`, `MAHASISWA`) is distinct from event audience (`ALL_STUDENTS`, `KADIV`). `KADIV` is SR position.
- HCO members can create/QR/view/export. A KADIV **in department HCO** alone may insert/correct manual attendance with a reason and audit. Check both fields on every protected server procedure.
- Initial superadmin is a system privilege, not a fifth actor. Initially only superadmin changes SR department, position, building and active status; no implicit bypass of attendance permissions. Reject inactive users during authentication and protected actions, regardless of stored sessions or invitation snapshots.
- Adopt deny-by-default action permissions, don't trust custom role claims supplied in request bodies.

## 5. Event, QR and attendance consistency

- HCO chooses event audience, scheduled start/end, map pin or latitude/longitude center, radius default **20 meters**, late tolerance default **15 minutes** and QR lifetime default **six hours from activation**, all configurable per event. Radius/accuracy/TTL/grace bounds remain TBD; coordinates and radius are separate units.
- At publication, persist eligible participant snapshots atomically. Historical reports retain all invitees and organizational snapshots. Check-in uses the snapshot plus live active-account status; later assignment changes do not silently replace the roster.
- QR uses an unpredictable event-bound token, static during its lifetime, displayable directly on the event page, with HCO revocation and no automatic rotation. Reject before activation, on expiry or revocation. The canonical data model's HMAC reconstruction protocol is **PROPOSED**, not yet implemented.
- Validate browser location/distance on the backend; client location and GPS accuracy are untrusted/imperfect. Failed verification directs participants to KADIV HCO for manual entry. GPS accuracy threshold and radius range need field testing.
- Active QR permits scans before event start and after event end; scheduled end is not an automatic cutoff. QR scan `attendance_at` uses actual server time. `EARLY` before start, `ON_TIME` through start + tolerance inclusive, `LATE` afterward.
- Presence is separate from timing: a record means present; missing record means pending until attendance-window closure, then absent. Authorized HCO closes explicitly, invalidating active QR and reporting non-attendees absent; expiry/scheduled end alone does not close an event.
- Enforce `UNIQUE(event_id,user_id)` and the proposed composite FK to invitations; concurrent QR/manual inserts cannot create duplicates. Report via all participants LEFT JOIN attendance, including absentees. CSV required, XLSX optional; include NIM/name, organizational fields, presence, effective time, timing, lateness duration and source, excluding credentials, QR secrets and raw GPS coordinates.
- Only KADIV HCO searches/selects an invited participant by name/NIM, inserts manual attendance with mandatory reason and effective time defaulting to server now (override permitted), or corrects existing attendance. Compute timing automatically. Preserve immutable original `recorded_at`; every insertion/correction appends before/after audit atomically; corrections retain original source. Override bounds remain TBD; no SR request/approval subsystem.

## 6. Suggested tRPC boundaries

- `eventRouter`: list eligible, create, update, view details, event QR issue (or delegate to qr router).
- `attendanceRouter`: check in, own history, per-event report and export.
- `manualAttendanceRouter`: participant search, manual insertion and audited correction, restricted to KADIV HCO.
- `identityRouter`/Better Auth endpoints: session and login; no public sign-up.

Shared `protectedProcedure` checks authenticated session; dedicated scoped procedures check actor, department/position and event/row ownership; Zod validates every input. Business actions live in testable services rather than huge route handlers.

## 7. Initial DB & migrations

- Prefer migration files generated by Drizzle rather than uncontrolled `push` against production. Never run destructive migrations without reviewing SQL and a recovery plan.
- Partition auth tables from SR directory and event/attendance domain tables (schema boundary in code even when one Postgres database).
- Use canonical proposed PK/FKs/indexes: participant composite PK, attendance unique/composite participant FK, QR current-challenge index and audit event/record indexes. Validate defaults/nullability against the generated schema before implementing.
- Publication snapshots preserve invitations and organizational history. Published title/description edits only, immutable audience/schedule and original attendance source are confirmed; center/radius/late-tolerance freeze still needs PM confirmation; do not silently alter past timing classifications.
- Store all instants as UTC, display Asia/Jakarta. Coordinates decimal degrees, radius and accuracy meters.

## 8. Local and production environments

### Local development

- Supabase Development is the external PostgreSQL target. Express/Drizzle uses `DATABASE_URL` (Session Pooler); migration tooling prefers `DIRECT_DB_URL` (Direct Connection). Direct failures never silently switch connections; see `docs/setup.md` for IPv6 and explicit Session Pooler alternatives.
- pnpm launches Next.js on Node and Express on Bun locally. Docker PostgreSQL remains optional behind the Compose `local-db` profile; default Compose starts web/server using the server's configured external URL.
- Use `pnpm run db:start`, `pnpm run dev`, `pnpm run check-types`, etc. **only if present** in `package.json`.
- Env files and secrets are ignored by Git. Store examples with placeholders, validate required env. Port assignments may change.

### VPS / deployment (proposed)

- Use `--web-deploy docker --server-deploy docker` and generated root Compose; adjust host origin, auth URL, trusted origins and CORS.
- Put reverse proxy and TLS termination in front; don't publicly expose Postgres, Express internals or dev services.
- Change all placeholder DB passwords and auth secrets. Review cookie domain/secure/sameSite policy if using multiple subdomains.
- Verify Supabase-managed backups and restore; optional local PostgreSQL requires its own volume backups. Test restore, document migration/rollback and health checks. Funding, domain/subdomain and SLO TBD.

Official deployment guide: https://www.better-t-stack.dev/docs/guides/docker

## 9. Initial security tests

- Non-HCO SR cannot create QR/event or export others' attendance.
- HCO member who is not KADIV cannot insert manual attendance/correct; KADIV of another department also cannot insert manual attendance/correct.
- SR cannot check in to `KADIV` audience if not KADIV; KADIV of any department can.
- SR remains eligible for `ALL_STUDENTS` despite exclusive primary actor; non-SR students cannot log in during pilot.
- Duplicate and concurrent check-ins produce one record; QR expired/revoked rejected; missing attendance stays pending until window closure, then absent.
- GPS disabled/out-of-radius → contact KADIV HCO for audited manual entry; no server authorization bypass via forged client payload.
- Security review of export, sessions, reset and provisioning.

## 10. Architecture unknowns

1. Cancellation/reopening/republication handling; explicit HCO close/reissue are confirmed. Reissue uses configured TTL and leaves previous challenges invalid.
2. Final approval of recommended center/radius/late-tolerance freeze; published title/description edits only and immutable audience/schedule are confirmed.
3. GPS accuracy/radius limits after field testing, QR TTL/grace bounds and manual override limits (including now-inactive participant backdating).
4. Actual roster dictionary values and secure credential delivery; Gmail SMTP operational setup and recovery/verification policy.
5. DNS/subdomains, proxy, production VPS ownership, funding, backups and operational targets.
6. Retention, export logging/filters and lateness-duration basis/rounding.

See [ADRs](decisions/README.md), [data-model repository compatibility review](modules/need-001/resora-need-001-data-model.md#12-repository-compatibility-review-2026-10-10) and [pnpm migration verification](pnpm-migration.md). Phase 2A changes only identity source/configuration, migration artifacts/tests and related documentation. No migrations have been applied.
