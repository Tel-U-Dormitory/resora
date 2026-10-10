# RESORA — Technical Architecture (Draft)

**Status:** Proposed design baseline | **Date:** 2026-10-10  
The Better-T-Stack 3.44.3 scaffold now exists (`bts.jsonc`). Phase 1 uses Supabase Development PostgreSQL through Express/Drizzle, with optional local Docker PostgreSQL. Product/domain sections below remain the proposed baseline.

## 1. Approved technical choices

| Layer                     | Choice                                        | State                                           |
| ------------------------- | --------------------------------------------- | ----------------------------------------------- |
| Frontend                  | Next.js + TypeScript                          | PM-approved direction                           |
| Backend                   | Express.js + TypeScript                       | PM-approved direction                           |
| Backend runtime           | Bun                                           | Retained during package-manager migration       |
| Package manager           | pnpm 10.33.4                                  | Confirmed migration from Bun package management |
| API                       | tRPC                                          | PM-approved direction                           |
| Database                  | PostgreSQL                                    | PM-approved direction                           |
| ORM & schema/migrations   | Drizzle                                       | PM-approved                                     |
| Authentication            | Better Auth                                   | PM-approved; NIM/username configuration pending |
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
| QR Challenge  | mint, rotate, revoke and verify challenge bound to an event                   | reusable NEED-001/007      |
| Attendance    | record, compute classification, concurrency, report                           | NEED-001-specific adapter  |
| Manual Review | submit request, approve/reject, correction and audit                          | NEED-001                   |
| Audit         | privileged modifications, exports, correlation IDs                            | cross-cutting              |

Avoid `qr.generateAttendance` as a universal service. Prefer reusable primitives such as `qr.issueChallenge({subjectType,subjectId,...})` (typed domain-specific policies); attendance services own eligibility and time windows.

## 4. Authentication, provisioning and permission model

- Only `SR` logins for pilot; public sign-up **disabled**, not just hidden.
- Better Auth Email+Password with Username Plugin: `username=NIM`, `signIn.username(...)`; plugin requires an **email during user creation**. Determine verified real address vs approved internal placeholder strategy before real user import. Do not fabricate operational email destinations or enable unverifiable password resets.
- PM will supply initial SR and building data. Import must validate uniqueness, trim/normalize NIM, link exactly one department and one building, verify position.
- Generate temporary passwords with cryptographic randomness and sufficient entropy; deliver via a secure one-time mechanism. Store hashes through Better Auth only; do not log/commit/export plaintext passwords.
- First-login password change is a security requirement; verify if generator/auth plugin provides such enforcement, otherwise implement explicit app-level gate.
- Account has one **primary actor**. Actor (`SR`, `MAHASISWA`) is distinct from event audience (`ALL_STUDENTS`, `KADIV`). `KADIV` is SR position.
- HCO members can create/QR/view/export. A KADIV **in department HCO** alone may correct and decide manual attendance. Check both fields on every protected server procedure.
- Adopt deny-by-default action permissions, don't trust custom role claims supplied in request bodies.

## 5. Event, QR and attendance consistency

- Event config includes audience, start/end, configured location center, radius default 20m, grace default 15min. Default center's actual coordinates must be configured by PM/HCO and are **TBD**.
- QR challenge should use an opaque unpredictable nonce bound to event and a short expiry; avoid raw trusted event IDs alone and keep challenge token out of logs. Expiration duration **TBD** after UAT.
- Geolocation validation: calculate distance server-side (geodesic/haversine approximation acceptable at short range), using reported coordinates and reported accuracy. Location is **untrusted input**; choose and document accuracy threshold. Radius 20m is **configurable**; GPS error may exceed it, so manual flow is critical.
- Server clock determines attendance time and `PRESENT`/`LATE`. Proposed within event duration with 15-min configurable grace. Event-open rules **await HCO approval**.
- DB constraint `UNIQUE(event_id, user_id)` for confirmed attendance. `INSERT ... ON CONFLICT` or transactional equivalent; failures/retries should not create duplicate state.
- Manual request is a separate object: pending is **not** attendance. Approved request transitions record atomically with unique check and immutable audit; explicit reason, approver and before/after values.
- Event eligibility should use a single authorization predicate shared between listings and mutation; snapshot-vs-live membership policy TBD.

## 6. Suggested tRPC boundaries

- `eventRouter`: list eligible, create, update, view details, event QR issue (or delegate to qr router).
- `attendanceRouter`: check in, own history, per-event report and export.
- `manualAttendanceRouter`: request, list pending, decision and correction.
- `identityRouter`/Better Auth endpoints: session and login; no public sign-up.

Shared `protectedProcedure` checks authenticated session; dedicated scoped procedures check actor, department/position and event/row ownership; Zod validates every input. Business actions live in testable services rather than huge route handlers.

## 7. Initial DB & migrations

- Prefer migration files generated by Drizzle rather than uncontrolled `push` against production. Never run destructive migrations without reviewing SQL and a recovery plan.
- Partition auth tables from SR directory and event/attendance domain tables (schema boundary in code even when one Postgres database).
- Index event start/end, event audience reference, attendance unique `(event_id,user_id)`, manual request `(event_id,status)` and relevant assignment attributes.
- Decide how to preserve historical attendance if SR position/department/building changes; do not silently alter past classification.
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
- Create DB volume backups, test restore, document migration/rollback and health checks. Funding, domain/subdomain and SLO TBD.

Official deployment guide: https://www.better-t-stack.dev/docs/guides/docker

## 9. Initial security tests

- Non-HCO SR cannot create QR/event or export others' attendance.
- HCO member who is not KADIV cannot approve/correct; KADIV of another department also cannot approve/correct.
- SR cannot check in to `KADIV` audience if not KADIV; KADIV of any department can.
- SR remains eligible for `ALL_STUDENTS` despite exclusive primary actor; non-SR students cannot log in during pilot.
- Duplicate and concurrent check-ins produce one record; QR expired/revoked rejected; manual request pending does not count as checked in.
- GPS disabled/out-of-radius → manual request path rather than bypass; no server authorization bypass via forged client payload.
- Security review of export, sessions, reset and provisioning.

## 10. Architecture unknowns

1. Email strategy required by Better Auth Username Plugin and password-reset workflow.
2. Actual event QR TTL and center coordinates; GPS accuracy threshold.
3. Permission to create/edit event after publish or after attendee scan.
4. Source/format and secure distribution of initial SR roster/accounts.
5. DNS/subdomain naming, proxy setup, production VPS ownership and budget.
6. Retention of location, event logs and auth/session data.

See `docs/decisions` for accepted vs proposed choices.
