# RESORA — Technical Architecture & Repository Standards

**Document type:** System-wide Technical Architecture  
**Version:** 0.3.1 — folder convention clarified 2026-10-11  
**Owner:** RnD engineering, subject to PM approval for consequential scope, data and deployment changes  
**Status:** Approved technology direction + **proposed target folder/domain architecture**. Some foundation is implemented; Phase 4 internal event/session/QR is implemented; attendance records, folder reorganizations and deployment remain future work.

> **Document boundary:** The [system-wide PRD](prd.md) owns **business rules, user actors, feature scope and ownership**; this document owns **how the implementation is organized, boundaries, constraints, interfaces, migration strategy and operations**. Module PRDs and FR Master are the authoritative reference for feature acceptance. A technical pattern written here does not grant new business permissions.

## 1. Current technology baseline and readiness

| Layer                | Baseline                                                          | Current state / caution                                                                                                                              |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend             | **Next.js**, React, TypeScript                                    | Scaffold/repository present; feature-based folders below are **target standard**.                                                                    |
| Backend entrypoint   | **Express.js** with **Bun 1.3.13** runtime                        | Repo present; keep runtime bootstrap thin.                                                                                                           |
| API boundary         | **tRPC** + Zod schema validation                                  | Existing `packages/api`; Identity and Phase 4 Attendance modules implemented.                                                                                                    |
| Identity             | **Better Auth** + Username Plugin (`username=NIM` for SR)         | Phase 2B SR login/logout, live active-account enforcement and first-password-change gate tested locally; provisioning/recovery and pilot UAT pending. |
| Primary database     | **External Supabase PostgreSQL (production for now)**                                   | Docker PostgreSQL is optional development-only; local manual SUPERADMIN backups remain available, disabled in production.                                                                      |
| ORM & schema         | **Drizzle**                                                       | Existing schema and **three applied/verified identity foundation migrations** in Supabase Development. Attendance/domain migrations **not applied**. |
| Workspace            | **pnpm 10.33.4**, pnpm workspaces, Turborepo                      | Project scaffold exists.                                                                                                                             |
| Shared packages      | `packages/api`, `auth`, `db`, `config`, `ui`                      | Some package content still scaffold-level.                                                                                                           |
| Tooling              | TypeScript strict checks, Biome, Varlock/environment schema       | Preserve actual scripts/tool versions from repo; CI policy TBD.                                                                                      |
| Deployment           | Rumahweb VPS + Docker Compose + existing NPM | **Not deployed or production-proven.** Proxy/limiter, TLS/pool, secrets, operations and backup gates remain. |
| Development database | Supabase Development; optional disposable local Docker PostgreSQL | Never confuse successful Development migration with production readiness.                                                                            |

**Correction to the previous Architecture:** Phase 2A.6 **did apply and verify** the reviewed identity migration chain on Supabase Development. Any older closing statement claiming that no migrations have been applied is obsolete. There have been **no attendance-domain migrations**.

## 2. Logical architecture

```text
 Browser / mobile (SR and, later, mahasiswa/maba)
                         |
                    HTTPS / TLS
                         |
                  Web routing / HTTPS proxy
                     /         \
                    /           \
          apps/web (Next.js)   apps/server (Express: Node/Bun)
                    |                |
                tRPC client <----> packages/api (tRPC boundary)
                                     |
                              Domain services/policy
                                /            \
                      packages/auth       repositories
                                               |
                                          packages/db
                                               |
                                     PostgreSQL (Supabase)
```

**Non-negotiable boundaries**

1. **Browser/web does not access PostgreSQL directly.** Database access flows through protected backend use cases. Next.js server-side rendering does not become an alternative DB permission bypass.
2. **Authentication ≠ authorization.** Better Auth establishes the user/session; backend domain policies decide whether that user may operate on the event/session/row.
3. **Modular monolith first.** Multiple business domains share one deployment and database but do not share permission scope or reach into one another's private repository logic.
4. **Shared engine, separate domain owners.** MOD-03 Attendance is reusable; its HCO and Adaptif contexts must remain isolated by operator and eligibility policy.
5. Shared code is extracted only when there is a genuine reused, stable contract. Avoid a universal god-service or `shared/` folder as a dump for business rules.

## 3. Repository structure standard — feature-first, shallow, **TARGET**

RESORA uses **one directory per stable business domain/feature**, with related files **co-located directly inside that directory**. Do **not** create mandatory `components/`, `hooks/`, `api/`, `types/`, `router/`, `service/`, `repository/`, `schema/`, `policy/`, or `tests/` subdirectories inside each feature when they would contain only one file. Names such as `attendance.service.ts` describe the file’s responsibility without requiring another nesting level.

This is the **target convention** for new work and incremental refactoring, not the current repository tree. Existing working routes/routers must not be moved solely to match the diagram. The directory list below is illustrative: **do not generate empty feature directories** before those features are implemented. The only sample files shown are for `attendance`, to clarify file co-location; this is not a mandatory file checklist.

```text
resora/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── app/                  # Next.js URL routing/layouts
│   │       │   ├── (auth)/           # Route groups only if useful
│   │       │   ├── (dashboard)/
│   │       │   └── (public)/
│   │       ├── features/             # Feature-first; flat per domain
│   │       │   ├── identity/
│   │       │   ├── attendance/
│   │       │   │   ├── attendance-view.tsx
│   │       │   │   ├── attendance-form.tsx
│   │       │   │   ├── use-attendance.ts
│   │       │   │   └── attendance.schema.ts
│   │       │   ├── activity/
│   │       │   ├── resident/
│   │       │   ├── inspection/
│   │       │   ├── complaint/
│   │       │   ├── performance/
│   │       │   └── inventory/
│   │       ├── components/           # Truly reusable within this app
│   │       └── lib/                  # Shared app-level infrastructure
│   └── server/
│       └── src/                    # Thin Express/Bun bootstrap
│
├── packages/
│   ├── api/
│   │   └── src/
│   │       ├── modules/            # Domain-first; flat per domain
│   │       │   ├── identity/
│   │       │   ├── attendance/
│   │       │   │   ├── attendance.router.ts
│   │       │   │   ├── attendance.service.ts
│   │       │   │   ├── attendance.repository.ts
│   │       │   │   ├── attendance.policy.ts
│   │       │   │   └── attendance.schema.ts
│   │       │   ├── activity/
│   │       │   ├── resident/
│   │       │   ├── inspection/
│   │       │   ├── complaint/
│   │       │   ├── performance/
│   │       │   └── inventory/
│   │       └── shared/             # Only for real cross-domain reuse
│   ├── auth/                        # Better Auth provider/session
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema/              # Drizzle table definitions
│   │   │   └── migrations/          # Reviewed migration chain
│   │   └── scripts/
│   ├── config/
│   └── ui/                         # Shared design system
│
└── docs/
    ├── modules/                   # PRDs/acceptance per NEED
    │   └── need-001/
    └── decisions/                 # ADRs
```

The attendance example is deliberately **not** duplicated as separate feature trees for HCO and Adaptif. Their UI flows and backend permissions may vary, but both use the `attendance` domain and the single MOD-03 engine. Source code domains are named `attendance`, `activity`, etc., **not** `need-001` or `need-007`. Next.js route groups are optional organization mechanisms, not a requirement to modify existing URLs.

### 3.1 Rules against unnecessary abstraction and nesting

| Rule              | Standard                                                                                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary grouping  | One directory per stable business feature/domain.                                                                                                                                                                |
| Default depth     | Files are **flat within their feature folder**; no one-file technical-layer subfolders.                                                                                                                          |
| File creation     | Introduce `.service.ts`, `.repository.ts`, `.schema.ts`, hooks or test files **only when responsibilities justify them**; not every feature must contain every layer.                                            |
| Subfolders        | Add a subfolder only when it groups several genuinely related files or a substantial **business subfeature** and demonstrably improves navigation. Do not group by file type reflexively.                        |
| Naming            | Directories in `kebab-case`; feature files use descriptive names with predictable suffixes, e.g. `attendance.router.ts`, `attendance.service.ts`, `use-attendance.ts`, `attendance-form.tsx`.                    |
| Imports           | Prefer feature-local imports. Keep a deliberate public API for cross-domain access; never import another feature's private repository or policy implementation directly.                                         |
| Common code       | Extract to app-level shared folders or `packages/ui` **after real reuse**. Avoid premature shared abstractions and overlapping design systems.                                                                   |
| Tests             | Co-locate relevant unit tests beside implementation, e.g. `attendance.service.test.ts`, rather than creating `tests/` for one file. Large integration/E2E suites may use a separate test harness when justified. |
| Existing scaffold | Evolve the current structure gradually. A folder-standard change is **not** a mandate for an immediate, broad relocation.                                                                                        |

### 3.2 Ownership of the top-level locations

| Location                             | Responsibility                                                                                                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/app/`                  | Next.js URLs, page/layout files, loading/error boundaries and composition of features; no business-rule authority.                                             |
| `apps/web/src/features/{domain}/`    | Domain-owned React components, feature state/hooks, API integration, form validation and types **co-located in one feature folder**.                           |
| `apps/web/src/components/`           | Truly reusable UI within the web application; `packages/ui` owns reused design-system primitives.                                                              |
| `apps/server/src/`                   | Express/Bun entrypoint, transport wiring, runtime config, middleware and health endpoints; not the main location for domain use cases.                         |
| `packages/api/src/modules/{domain}/` | tRPC routers, business services, policy, domain data access, Zod validation and colocated tests.                                                               |
| `packages/auth/`                     | Better Auth provider, session and identity infrastructure. Account/organizational domain operations still require authorization in API modules.                |
| `packages/db/`                       | Drizzle schema/migration ownership and backend database integration; feature-local `.schema.ts` files are **Zod input schemas**, not duplicate Drizzle tables. |
| `packages/api/src/shared/`           | Stable, reusable transport/error infrastructure; never a dumping ground for business logic or an authorization bypass.                                         |

## 4. Frontend: co-located feature implementation

**Default example:** `apps/web/src/features/attendance/` may contain `attendance-view.tsx`, `attendance-form.tsx`, `use-attendance.ts`, `attendance.schema.ts`, and a test beside the behavior under test. These are **illustrative names, not mandatory scaffolding**. If one simple component and a typed tRPC call suffice, there is no requirement to invent an API wrapper, separate type declaration, hook, or validation module.

- **Routing vs implementation:** `app/` determines the URL, layout and page-level composition; the feature directory owns nontrivial UI and orchestration. Avoid duplicating the full `app/` route structure under `features/`.
- **UI state and server state:** a hook is useful only when stateful logic is reused or complex enough to extract. Use the existing typed tRPC integration rather than wrapping every procedure in a redundant function.
- **Validation and types:** use a feature-specific Zod schema when a form needs it; backend validation is mandatory regardless. Prefer inferred tRPC/Zod types over copied DTO interfaces.
- **Sharing:** keep attendance-specific UI within `features/attendance`, activity registration UI within `features/activity`, and general design-system primitives in `packages/ui`; do not place business-specific components in global `components/` solely to shorten an import.
- **Growth:** if a feature genuinely grows into multiple coherent business areas (e.g. `roster` versus `check-in`), evaluate business-subfeature extraction **when needed**. A subdirectory containing one file is not an architectural milestone.

Frontend still follows the established NEED boundaries: HCO event/roster screens for SR and Adaptif registration/attendance screens for general activities call the shared attendance backend with context-aware permissions; the UI never independently decides who may attend.

## 5. Backend: flat domains, clear boundaries

**Default example:** `packages/api/src/modules/attendance/` keeps `attendance.router.ts`, `attendance.service.ts`, `attendance.repository.ts`, `attendance.policy.ts`, and `attendance.schema.ts` **side by side**, with optional colocated test files. This is a **responsibility model**, not an obligation to create six files or six folders for every feature. For simple workflows, direct service-to-Drizzle access may be appropriate; introduce a repository abstraction when query reuse, transactional clarity or testing benefits justify it.

| Responsibility  | Common file name (when needed) | Purpose                                                                                                                                          |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Transport       | `attendance.router.ts`         | Typed tRPC procedures, input parsing, authenticated context and permission entry points.                                                         |
| Use cases       | `attendance.service.ts`        | State transitions, eligibility enforcement, orchestration and transactions.                                                                      |
| Persistence     | `attendance.repository.ts`     | Domain-owned reusable Drizzle queries. **Optional**, not a universal mandatory layer.                                                            |
| Access policy   | `attendance.policy.ts`         | HCO/Adaptif operator rules, KADEP HCO restrictions, invitation/registration eligibility. Extract when policy complexity merits a dedicated file. |
| Input contracts | `attendance.schema.ts`         | Zod validation/input/output; not the Drizzle database schema.                                                                                    |
| Tests           | `attendance.service.test.ts`   | Unit/integration tests next to the implemented unit; cross-domain E2E tests can be grouped by actual test suite later.                           |

**Preferred logical flow:** `tRPC router → business use case / policy → Drizzle access → packages/db → PostgreSQL`. This is a **call-direction constraint**, not a mandate for a separate class/file/folder per arrow.

- Route handlers should not accumulate business rules. Service-level checks also protect future jobs/internal callers from bypassing policies.
- Domain modules cannot directly import another module's private persistence implementation. Share explicit typed contracts/services; avoid circular references.
- Keep database transaction ownership clear: event publication + snapshot and registration quota + cancellation must be atomic. Attendance scan must enforce idempotency and single-record uniqueness.
- Do not copy a QR engine into `activity`. Use one MOD-03 attendance implementation and activity eligibility lookup through a constrained interface.
- Avoid generic `BaseService`, `BaseRepository`, pass-through API wrappers, one-method classes, duplicate type definitions, barrel files with no public-boundary benefit, and files/directories created purely for a template.

### 5.1 Domain-to-module mapping

| Domain folder  | Business capability / owner                               | Notes                                                                                                |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `identity`     | MOD-01; RnD/SUPERADMIN-controlled administration          | Better Auth provider configuration itself stays in `packages/auth`.                                  |
| `attendance`   | **MOD-03 shared**; HCO/Adaptif according to event context | One QR/session engine, context-specific eligibility/permissions.                                     |
| `activity`     | MOD-06/NEED-007; Adaptif                                  | Event registration, quotas, cancellation; delivers registered-participant eligibility to attendance. |
| `resident`     | MOD-02 resident information                               | Student occupancy and official data sync separate from SR organizational identity.                   |
| `inspection`   | MOD-04                                                    | Policies/details await owner validation.                                                             |
| `complaint`    | MOD-05                                                    | Policies/details await owner validation.                                                             |
| `performance`  | MOD-07                                                    | KPI rules remain a different domain from attendance.                                                 |
| `inventory`    | MOD-08                                                    | Separate inventory lifecycle.                                                                        |
| Future domains | MOD-09–MOD-14                                             | Create when corresponding scope is approved.                                                         |

**Caution:** A `need-001` source folder is appropriate under `docs/modules/` for requirements history, but implementation belongs to the reusable business `attendance` domain and supporting `identity` domain. Do not create a different code tree per NEED or stakeholder department.

## 6. Authentication, identity and RBAC

### 6.1 Identity baseline

- Use Better Auth with Username Plugin: **SR `username = NIM`**, preserving leading zeros as a string. Confirm status for a user before permitting protected actions; session alone is not an active-account guarantee.
- The user has one primary actor: `SR`, `MAHASISWA`, `ASUS`, `DITMAWA`, or dedicated `SYSTEM_ADMIN` (SA-03). SR attributes include exactly one department, one position and one building; **Inti** means the official INTI department; approved pair validation restricts executive positions to INTI and KADEP/SEKDEP/ANGGOTA to other departments.
- Pilot authentication accepts **SR and explicitly privileged SYSTEM_ADMIN only** (SA-03). Prevent public sign-up on backend, not merely UI. Phase 2C supplies guarded local CSV provisioning and temporary credentials; real imports/distribution still require approval; use real email addresses for eventual recovery, with SMTP settings only in server environment.
- `SUPERADMIN` is an explicitly assigned system privilege, separate from `actor=SR` and any department membership. SA-01 grants eligible active SUPERADMIN cross-department operational access, including HCO manual/audit and Adaptif policies. It never bypasses authentication/password gates, valid assignment, resource lifecycle, invitation/target validation, integrity or audit.
- Phase 2B enforces `user_profiles.must_change_password` on protected tRPC procedures and dashboard routes; Better Auth verifies the old password, rotates sessions and then clears the existing flag. Phase 2C implements local synthetic provisioning and credential output/recovery; SMTP/password recovery remain deferred Phase 2D work.

**Phase 2B implementation:** `apps/web/src/features/identity` contains login, password-change, dashboard, session and account-menu files; App Router pages compose them. `packages/api/src/modules/identity/identity.router.ts` exposes a minimal identity DTO. `packages/auth/src/sr-access.ts` reads current identity through Drizzle; Express injects initialized services into its application/context. SSR also calls Express/tRPC and never imports a database client. See [validation evidence](modules/need-001/resora-need-001-data-model.md#16-phase-2b-sr-authentication).

The read-only `/profile` page shares the authenticated layout and its first-password-change gate. `identity.profile` uses `protectedProcedure`, derives the user ID from the verified session and projects only personal fields and organization labels. The existing password-change form supports mandatory changes at `/change-password` and voluntary changes that remain on `/profile`; session verification and revoking other sessions are preserved. Theme preferences continue through next-themes. The shared account menu portals into the native mobile navigation dialog when used there.

Public auth POST requests require a configured trusted Origin. Signup and email login are unavailable; NIM uses the Username Plugin. Better Auth 1.7.7 limits login/password-change each to 75 requests per 60 seconds per IP/path bucket. Phase 8B selects its native database storage whenever auth configuration or process NODE_ENV is production; local/test keeps memory. A new `rate_limit` migration is prepared but unapplied. Database failures fail closed with a sanitized Express 503, never memory fallback. Express overwrites the limiter IP header using a single valid x-vercel-forwarded-for address only on genuine Vercel runtime (VERCEL=1); local/Docker uses the socket IP. Invalid/missing addresses share a fixed loopback fallback bucket, and proxy trust stays disabled. Original visitor preservation and ingress spoof rejection through the actual two-project Vercel rewrite still require Preview verification; header presence alone is not proof of that topology. Users behind the same NAT share the configured limit; no username-based bypass was introduced. Cookies remain HttpOnly, SameSite=Lax, and Secure for HTTPS auth URLs. Cross-site domains, HTTPS and production proxy behavior require deployment review, not relaxed validation.

**Phase 3 implementation:** `getActiveSr` reloads actor, active state, password-change flag, department/position/building and explicit SUPERADMIN in one indexed Drizzle join. `sessionProcedure` rejects invalid sessions/ineligible SR; `protectedProcedure` blocks pending password change. Pure functions in `packages/api/src/modules/identity/identity-policy.ts` consume this server identity after those gates. The public `identity.session` DTO stays unchanged. HCO membership grants internal operations; HCO + KADEP alone grants manual internal correction; ADAPTIF membership grants general operations/manual attendance without a KADEP requirement. No extra operator flag, generic permission engine, parallel session/provider or dummy endpoint is added. SUPERADMIN grants identity administration only, not an operational bypass.

**SA-01 (2026-10-13) supersedes the historical Phase 3 no-bypass clause above.** Existing Identity policies are the single source of truth and use live DB `isSuperadmin`, never substituted department/position. `identity.session` now exposes `canManageInternalEvents`, `canManageInternalAttendanceManually`, `canOperateGeneralActivity` and gated `isSuperadmin`. Sidebar consumes the existing backend operator capability, so non-HCO SUPERADMIN sees HCO management navigation. Event/QR and manual mutations reload eligibility/grant through Identity's public `getLiveOperationalIdentity` after event/session locks (before inserts for creation), then reuse the same policy. Identity/reference rows and present privilege rows are share-locked; revoked grants are not carried from earlier request context. The next request re-reads DB privilege without login refresh. Audit creator/recorder/operator IDs remain the authenticated user. No new role, engine, module or schema is added.

Organization code definitions and idempotent seed live in `packages/db/src/organization.ts`; the local-only server CLI reuses the provisioning target guard. CSV validates official codes plus active DB references and resolves building TEXT code to UUID. See [canonical lists](modules/need-001/resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries) and [matrix](modules/need-001/resora-need-001-data-model.md#8-server-side-authorization-phase-3). Phase 4 adds INTI and reusable pair validation without changing identity schema, authentication or runtime.

### 6.2 Authorization matrix for attendance

| Protected operation                                             | Needed principal + contextual permission                                                                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create, configure, publish, close internal SR event             | Active eligible `SR` with **HCO membership or explicit SUPERADMIN**, followed by resource/state checks.                                                                                    |
| Build/select internal SR participant roster and preview         | Same HCO/SUPERADMIN permission, limited to eligible active SR roster.                                                                                         |
| Issue/revoke/reissue internal SR QR; view/export complete recap | Authorized active HCO or SUPERADMIN operator and event of **SR_INTERNAL** context.                                                                               |
| Scan SR internal QR                                             | Active authenticated **SR**, present in **published event snapshot**, valid session/QR/location, not already checked in.                           |
| Manual insert/correct internal SR                               | Active eligible SR with **HCO + KADEP or explicit SUPERADMIN**, invited target and mandatory audit reason.                              |
| Create/update/cancel activity registration                      | Authenticated eligible RESORA user, controlled by open registration window and MOD-06 rules.                                                       |
| Configure/activate/revoke/close general activity attendance     | Active authorized **Adaptif or SUPERADMIN** operator, event of **GENERAL_ACTIVITY** context.                                                                     |
| General activity QR check-in                                    | Authenticated account, **successful active/non-cancelled MOD-06 registration**, valid QR/session/location, not previously checked in this session. |
| Manual insert/correct general activity attendance               | **Authorized Adaptif or SUPERADMIN operator**, valid registration target, mandatory reason and immutable audit; no KADEP requirement.                        |
| Update SR department/position/building/account active flag      | Explicit `SUPERADMIN` privilege with audit; HCO/Adaptif/ordinary RnD membership alone insufficient.                                                |

The uppercase context names above are **proposed code-level discriminators**, not confirmed persisted database enum names. Backend policy must check resource context, not just who owns the QR link or which page rendered the form. Policy tests include direct tRPC requests with forged department/position or another event ID.

## 7. Shared attendance engine and module contracts

**Principle:** common check-in mechanics, **separate eligibility providers and operators**.

```text
  NEED-001 / HCO                         NEED-007 / Adaptif
  -----------------                      ---------------------
  SR internal event                       General activity
         |                                    |
  Published invited SR snapshot            MOD-06 registration
         |                                    |
     Eligibility check <----- typed -----> Eligibility check
                     \                 /
                      \               /
                   MOD-03 Attendance
                  (session, QR, geofence,
                   record, audit, reports)
```

### 7.1 Event, session, challenge and record

| Concept                              | Technical responsibility                                                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `events` / activity event reference  | Who organized the event, business context, schedule, publication/closure and policy configuration. Attendance owns current internal events; future Activity parent binding is deferred.                            |
| `event_participants`                 | For NEED-001, immutable **publish-time snapshot** of the final invited active SR after composable filters and manual include/exclude.                                                                         |
| `activity_registrations`             | For NEED-007, authoritative successful/not-cancelled registration and capacity allocation; **owned by activity domain**.                                                                                      |
| **`attendance_sessions`** | Explicit session active/closed state, event/context reference, configured operator/location/QR policy. NEED-001 **one session per event** initially; multiple sessions later only with approved requirements. |
| `qr_challenges`                      | Unpredictable token/challenge attached to session; activation, current challenge, expiry, revocation and controlled reissue.                                                                                  |
| `attendance_records`                 | Actual presence per **`(session_id, user_id)`**; effective time, immutable recorded time, timing classification and source.                                                                                   |
| `attendance_audit_logs`              | Immutable actor, time, reason and before/after changes, including manual inserts/corrections.                                                                                                                 |

Do **not** retain old `UNIQUE(event_id,user_id)` as the universal shared-engine uniqueness rule. The proposed new invariant is **`UNIQUE(session_id,user_id)`**, with a separately enforced entitlement to that session's eligible source. For one internal SR session/event, this still gives one attendance per event. This is a **conceptual design direction**, not an instruction to alter applied SQL before review.

**Current model baseline:** [the canonical data model](modules/need-001/resora-need-001-data-model.md) now follows composable active-SR selection, immutable publication snapshots, session-bound QR/records and domain-owned eligibility. Historical sections retain prior proposals/test evidence. **Phase 4 PM FINAL:** Attendance owns internal events; session has UNIQUE NOT NULL `internal_event_id` FK. Atomic create plus deferred inverse triggers enforce exactly one session at commit; binding cannot change. There is no standalone close-session API/UI. No shared registry or polymorphic design; future Activity association requires later review. See [open decisions](modules/need-001/resora-need-001-data-model.md#10-decisions-to-close-before-implementation--production).

### 7.2 NEED-001 event/attendance flow

1. HCO drafts an event with schedule, map point (Dorm Hall preset or a custom pin) and radius (default 20 m), grace period (default 15 min) and QR TTL (default 360 min). HCO selects **all active SR**, one/multiple departments, **all KADEP across departments**, specific individuals, or combined criteria. **Inti** means department INTI; **Inti+KADEP** unions it with every non-INTI KADEP, with explicit exclusion winning. Manual individual include/exclude applies to the **draft**.
2. A roster resolver produces a **deduplicated draft preview** from the current active SR directory and the explicit include/exclude set. The resolver must not change SR master assignments or treat an invitee as already present.
3. **Publish** re-resolves the final active roster from a consistent directory view; its transaction freezes the resulting participants and required historical identity/organizational snapshots, then makes the event discoverable by invited SR. Only title/description are confirmed editable afterwards; postpublication roster amendments are TBD.
4. HCO activates the attendance session and issues a **static verifiable QR challenge**. Default expiry = activation + six hours; configurable TTL, explicit revoke/reissue; no automatic rotation. QR expiration alone does not close the event.
5. QR scan validates live authenticated SR account, snapshot, session active state, **current** QR challenge, validity, location and uniqueness. The server chooses attendance timestamp; it may accept scans before scheduled start/after scheduled end **while both session and QR are valid**.
6. Presence record has `PRESENT` plus `EARLY`/`ON_TIME`/`LATE` using event start and configured grace; 15-minute grace boundary is **inclusive**. Missing invitees are `PENDING` until HCO **explicitly closes event**, then `ABSENT` is derived from no record.
7. KADEP HCO only may insert/correct manually for an invitee, using reason, effective time and append-only audit. Original record timestamp and source stay immutable; enforce transaction atomicity.
8. HCO explicit event closure atomically closes its one attendance session and invalidates the current QR; session activation/closure is distinct from event publication/scheduled end. There is no standalone close-session API/UI or reopen/cancel/republish in NEED-001. HCO recap/CSV begins from **all participant snapshot rows**, resolving the event's one session and joining records on `(session_id, user_id)`, not merely listing attendance records. Exclude tokens, credentials and raw GPS from exported data.

**Geolocation:** The browser provides a location measurement and its accuracy; the backend verifies distance (meters) from configured center (latitude/longitude). Client data and GPS can be spoofed; initial maximum accuracy is 20 m via one backend constant (adjustable to 30 m after UAT); event radius defaults to 20 m and is frozen at publish. Backend Haversine validation accepts distance <=radius; numerical inputs remain untrusted. Successful QR attendance stores only one DOUBLE PRECISION scan_lat/scan_lng/gps_accuracy_m package; no failed scan or continuous GPS history. General DTOs/recaps/exports omit raw GPS; dedicated audit access and retention require approval before Production/real pilot. Explain storage before GPS permission. Location failures do not create a record; KADEP HCO manual correction is the controlled fallback.

**Published policy:** final PM decision freezes roster, schedule and all session configuration (center, radius, grace, QR TTL); only title/description remain editable.

### 7.3 NEED-007 registration and Adaptif attendance flow

1. Adaptif configures a registration window and **limited positive integer capacity** or **unlimited** capacity. Successful registration immediately makes the participant eligible for attendance, until cancelled.
2. On a limited-capacity event, count/reserve seats **atomically** under concurrent requests. Full capacity → new request **rejected**, not queued or silently accepted. An eligible cancellation releases capacity; fresh applicants may register again **only while the registration form is open**.
3. Activity domain exposes a typed, backend-only **eligibility check for a given event and logged-in user**. A cancelled or nonexistent registration must fail. The student/maba login and account-provisioning mechanism is a separate dependency, not delivered by NEED-001.
4. **Authorized Adaptif operators** configure session location/radius, issue/revoke QR, activate/close sessions, and perform manual attendance/corrections with reasons and append-only audit. HCO is not in this workflow. Adaptif operator authority comes from active SR membership in `ADAPTIF`, not a mandatory `KADEP` title.
5. Check-in uses the shared Attendance service, but replaces SR snapshot eligibility with **current successful, uncancelled registration**. No duplicate records per session.

**Boundary:** Registration form, capacity and cancellation are implemented in `activity`; QR/geofence/check-in/manual audit in `attendance`. Shared code must not force registration on SR-internal meetings or invitee snapshots on Adaptif activities. Attendance for NEED-007 must be blocked until the non-SR authentication and registration lifecycle is ready.

## 8. Candidate API/tRPC contract boundaries

Phase 4 uses flat `attendance` procedures: `list`, `detail`, `directory`, `create`, `editDraft`, `editMetadata`, `preview`, `publish`, `activate`, `qr`, `revokeQr`, `reissueQr`, `close`. Future records/manual/Activity names below are illustrative only; no standalone session-close procedure is delivered.

| Domain                   | Candidate actions                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| `identity` / Better Auth | Sign-in, sign-out, active-account gate, authorized roster/provisioning, privileged SR assignment update. |
| `attendance.events`      | `createDraft`, `previewInvitees`, `publish`, `updateAllowedFields`, `close`, `listEligible`, `get`.      |
| `attendance.sessions`    | `activate`, `qr`, `revokeQr`, `reissueQr`; closure only via event `close`.                                 |
| `attendance.records`     | `checkIn`, `ownHistory`, `byEvent`, `exportCsv`.                                                         |
| `attendance.manual`      | `insert`, `correct`, `auditHistory` (scoped to operator context).                                        |
| `activity.events`        | Manage activity fields, registration-window and quota (subject to activity creation policy).             |
| `activity.registrations` | `register`, `cancel`, `getOwn`, internal `isEligibleForAttendance`.                                      |

**Transport pattern:** `protectedProcedure` authenticates, Zod validates, domain service enforces operator/context/row policy, and repository/transaction enforces persistence invariants. Use typed DTOs; avoid accepting `actor`, department, KADEP status or target owner supplied by the client as authority. Separate API public types from raw DB row types. Add pagination/filtering and export streaming limits if volume requires them.

## 9. Database integrity, transactions and audit

### 9.1 Foundations already present

Four Better Auth core tables plus six identity-domain tables are part of the **applied Phase 2A schema chain in Supabase Development**. Continue through reviewed additive migrations; do not re-run, reset or edit applied migrations to backfill conceptual attendance changes. The database must remain private behind backend transport.

### 9.2 Domain schema — Phase 4 locally validated; records/audit proposed

- `events`: Attendance-owned internal schedule/roster/lifecycle; future Activity events remain Activity-owned. No generic event registry.
- `event_participants`: one row per SR invitee/event at publish, with required publish-time SR identity/organization snapshot for reports; Phase 4 stores NIM/name, department/position codes and building code/name.
- `activity_registrations`: active/cancelled participant registration per activity and a capacity-invariant strategy; source for NEED-007 eligibility.
- `attendance_sessions`: immutable internal_event_id UNIQUE NOT NULL FK, INACTIVE/ACTIVE/CLOSED, geofence/radius/TTL/grace and activation/closure. Future Activity parent binding is deferred.
- `qr_challenges`: NN session FK; partial unique current challenge per session; reviewed secure mechanism that redisplays the same static QR. A one-way token hash alone is insufficient for redisplay; only current/unexpired/unrevoked challenges on active sessions are accepted.
- `attendance_records`: uniqueness on `(session_id,user_id)`, immutable origin/source and recorded_at, effective attendance time, timing classification and successful-QR GPS evidence (MANUAL GPS NULL).
- `attendance_audit_logs`: append-only session/record/actor, original/updated values and mandatory reasons for privileged operations.

A universal attendance FK to `event_participants` is not part of the shared-engine baseline: NEED-007 eligibility is owned by Activity. Design eligibility through a **context-aware service/constraint combination**; keep hard database uniqueness and foreign keys where possible, without pretending a general FK can reference both event participants and activity registrations automatically.

**Atomic operations and race-safety:**

- Publish event and its final active SR snapshot in one transaction, preserving preview/publish distinction. Review concurrent membership consistency and one-session association enforcement with the parent binding.
- Create QR/reissue with transaction-safe “current challenge” behavior. Never accept an expired or revoked challenge, and never expose the raw token in logs/exports.
- Check-in locks event then session in the same order as Phase 4 lifecycle mutations; validate current signed QR, locked live eligible identity and immutable invitation before GPS and record lookup. Use server time after locks and return only an explicit attendance DTO. Insert attendance idempotently; use DB uniqueness to guard racing scans/manual entries. Avoid replacing the original `attendance_at` or `recorded_at` on duplicates.
- Capacity-limited registration cannot be implemented as an unprotected `COUNT(*)` followed by `INSERT`; use a transaction-safe locking/counter approach with clear cancellation semantics. Reject overflow.
- Manual changes and their audit entry must succeed or fail as **one transaction**; original source and original operation time remain available.
- Use server timestamps in **UTC**, display local dates in **Asia/Jakarta**; NIM stays a string; latitude/longitude use decimal degrees and distance/accuracy use meters.

## 10. Environment, secrets and deployment architecture

### 10.1 Local and Development

- Workspace commands follow existing package scripts, verified via `package.json` rather than assumed. Start the web app on its Next.js-supported runtime and the Express server on **Bun**.
- The current remote dev database is **Supabase Development**. Runtime backend connectivity uses a configured `DATABASE_URL` (Session Pooler); reviewed migration operations prefer `DIRECT_DB_URL` (Direct Connection). Do not silently fall back to a different DB connection when one fails; document and approve any deliberate alternative.
- Production uses external Supabase PostgreSQL for now. Docker PostgreSQL is an optional development service (`local-db`), not a production primary. Existing manual SUPERADMIN dump functionality remains limited to explicitly configured local Docker PostgreSQL; it is disabled in production. No scheduled synchronization or automatic restore/failover.
- Keep secrets in ignored environment files or deployment secret stores; env schemas/examples must have placeholders only. Do not embed private credentials, SMTP secret, raw QR tokens or user production data in source/tests.
- Maintain synthetic SR accounts in development until a PM-approved real roster has been supplied securely.

### 10.2 VPS production configuration / portable deployment

- Current production target is Rumahweb Ubuntu 24.04 (1 vCPU, 1 GB RAM, 20 GB storage), using standalone `docker-compose.prod.yml`: Next.js standalone on Node 24 and Express on Bun in separate containers, external Supabase PostgreSQL. Existing Nginx Proxy Manager (`resora-proxy`) is the only public HTTP/HTTPS ingress. Only web joins its external `resora-proxy` network; server uses the project-scoped application bridge, which permits Supabase egress. Application containers publish no host ports. Vercel preparation remains historical/optional, not the current production target. See [VPS runbook](setup.md#9-rumahweb-vps-compose-production-phase-2-not-deployed).
- Browser auth/tRPC use the web origin through configurable Next rewrites; SSR uses the explicit backend URL and forwards the session cookie. Better Auth URL/trusted Origin stay the exact HTTPS web origin, with host-only cookies. No cross-subdomain cookie or proxy-trust relaxation. Never publish PostgreSQL or internal database/admin ports.
- Runtime uses only explicitly mapped `DATABASE_URL`; serverless Transaction Pooler is a candidate with pool max 1, short idle eviction, unnamed pg statements and verified TLS. No automatic Production connection selection; migration connections stay off the runtime. Live Transaction Pooler and Vercel packaging verification remain pending.
- Better Auth retains its native PostgreSQL shared limiter. Phase 3 authenticates NPM-supplied client-IP metadata using a separate runtime-only `AUTH_PROXY_SECRET`; Express proxy trust stays false. NPM must overwrite both custom headers in the effective location using its actual socket client address, and the backend strips the token before auth. Persistent production startup requires the secret; invalid metadata returns 403. Development socket and separate Vercel policies remain. Live NPM/source verification remains a go-live gate; see [client-IP runbook](setup.md#10-client-ip-and-auth-limiter-phase-3-operator-verification-pending). Confirm required migration state and security/UAT gates without applying migrations during deployment.
- Configure separate least-privilege access to external Postgres and operational secrets; test session behavior across the intended hostname design.
- Production readiness includes project/domain ownership, funding, monitoring, secure backup/restore, recovery targets, migration runbook, rollback/forward-fix plan, incident response and PM approval.
- Backup ownership and production Supabase subscription/point-in-time restore capabilities must be verified, not inferred from Development behavior. No production deployment is approved by this architecture.

## 11. Testing strategy and release gates

**Identity/RBAC tests:** deny public signup, invalid NIM, inactive user with an old session, direct request from non-HCO, ordinary HCO manual attempt, KADEP of another department, Adaptif attempting internal HCO operations, HCO attempting Adaptif events, unprivileged RnD attempting superadmin updates, forged client role fields.

**NEED-001 tests:** every roster builder filter and combination, explicit add/remove and deduplication, preview and publish snapshot, late department changes, session activation/expiry/revoke/reissue, QR scans outside scheduled time but within active QR, boundary geofence and 15-minute grace, duplicate and concurrent requests, manual KADEP audit and preserved source, explicit event close and absent projection, full CSV without sensitive secrets.

**NEED-007 tests (later):** account login and valid active registration required, no approval gate, limited/unlimited capacity, rejection when full, concurrent overbooking attempts, cancellation returns slot if form open, cancelled participant refused check-in, Adaptif-only session/multiple manual permissions and immutable audit.

**Engineering quality gate:** review SQL diffs before migration; type-check/lint/test; integration tests on disposable local database; inspect exact target and explicit approval before Supabase Development migration; UAT on appropriate devices and location conditions; stage/production backup and security review before release.

**Do not** treat a new directory tree, complete markdown spec, compiled UI, or successful identity migration as proof of attendance feature readiness.

## 12. Open technical/policy decisions

| Decision                                                                       | Impact                                            | Owner / timing                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------- |
| Postpublication invitee amendments / canceled/reopened events                  | Snapshot invariants, history and audit            | HCO + PM, before lifecycle implementation.                     |
| Radius/accuracy/TTL/grace bounds and indoor GPS tolerance                      | UX, spoof risk and field UAT                      | HCO/Adaptif as relevant + RnD.                                 |
| Manual effective timestamp bounds                                              | Audit and backdating controls                     | HCO/PM and Adaptif policy owner.                               |
| Future Activity/session binding (internal-only FK implemented)                                | DB ownership and FK design                        | RnD architecture review before attendance migrations.          |
| Future multiple attendance sessions per event                                  | UI, state and analytics                           | Not needed in NEED-001 MVP; approve only when use case arises. |
| Student/maba Better Auth onboarding                                            | NEED-007 authentication dependency                | Adaptif + PM + RnD before NEED-007.                            |
| Cross-department activity creation authority                                   | MOD-06 creation RBAC                              | Adaptif + PM; attendance operator rule already final.          |
| Privacy, raw coordinate retention, export logs, backup RPO/RTO and rate limits | NFR, production sign-off                          | PM + data owners + RnD.                                        |

## 13. Related documents and consistency obligations

- [System-wide PRD](prd.md): product scope, actors, owners, priorities and acceptance governance.
- [NEED-001 module PRD](modules/need-001/prd.md): current HCO internal attendance, composable roster and single-session requirements; INTI/session binding and configuration freeze are final; future lifecycle extensions remain out of scope.
- [NEED-001 acceptance scenarios](modules/need-001/acceptance-tests.md): active roster/session specifications aligned; dated identity test evidence retained; unbuilt domain tests await implementation.
- [NEED-001 data model](modules/need-001/resora-need-001-data-model.md): current roster/session/contextual eligibility proposal; event-reference storage and policy gates must be reviewed before Phase 4. Identity migrations remain intact.
- [NEED-001 roadmap](modules/need-001/roadmap.md): implementation sequencing, not release approval.
- [ADRs](decisions/README.md), especially attendance-related ADR: active roster/session decisions synchronized while dated Phase 2–3 history is preserved.
- [Setup and operations](setup.md): run commands, environment requirements, actual migration verification and deployment instructions.
- `AGENTS.md`: agent/developer execution guidelines, subordinate to business decisions and repository safety gates.
- **RESORA MAIN DOCUMENT**: approved IDs and requirement/decision mapping. Relevant official attendance FRs: NEED-001 `FR-086, FR-119–FR-130`; shared identity `FR-001, FR-094–FR-096, FR-101, FR-131–FR-132`; activity attendance NEED-007 `FR-044–FR-047, FR-133–FR-134` plus relevant registration/quotas FRs.

**Handover rule:** Never initiate event/attendance domain SQL migrations until the revised module PRD, acceptance scenarios, data model, and affected ADR all agree with the master FR and these owner/eligibility boundaries. This Architecture is **not** permission to mutate Supabase Development or production.

### Phase 4 implementation boundaries

`packages/api/src/modules/attendance/` owns event/session/QR logic and thin protected tRPC router. Identity exposes `identity.public.ts` for current eligible SR directory and HCO policy; Attendance does not read private Identity tables. Publishing obtains a locked consistent directory view and stores historical snapshots atomically. Event/session row locks serialize all lifecycle/QR mutations; partial unique current-challenge index is a second concurrency guard. Event/session creation and event/session/QR closure are atomic; exactly-one inverse and immutable binding are custom versioned SQL triggers. All HCO members can manage internal events regardless of creator; invited non-HCO sees PUBLISHED events only, without roster or QR secrets.

`attendance.public.ts` exposes backend-only QR verification for future Phase 5. Stable signed payloads use HMAC-SHA256 and a domain-separated HKDF key derived from existing Better Auth secret. No raw bearer token is persisted; secret rotation invalidates signatures. `qrcode` is the only added runtime dependency, for actual PNG rendering. No new auth provider, permission engine or session system. Frontend `features/attendance/` reuses existing UI/tRPC with thin `/events` routes and existing session/password redirects. Four-table additive migration is applied only to guarded local scratch; remote application still requires PM approval. Check-in, records, audit, reports and future Activity integration remain unimplemented.

### Phase 5 check-in implementation boundaries

`check-in.ts` owns the transaction; `check-in-policy.ts` holds Haversine/timing and the single initial MAX_GPS_ACCURACY_M=20 constant. Attendance reads locked live SR eligibility via Identity public `getCheckInSr`, never private Identity tables; protectedProcedure continues existing auth/password enforcement. Locks match event?session lifecycle order; request time is taken after lock waits, invalid QR never discloses existing attendance, and insert uses UNIQUE(session_id,user_id)/ON CONFLICT DO NOTHING. Check-in responses select only own effective time/classification, status and event title; raw GPS never reaches general DTOs. PM applied `20261012032606_phase5_checkin` to Supabase Development. Read-only verification matched all five migration hashes, columns, indexes, constraints and enabled triggers. Eighteen distinct targeted PostgreSQL cases passed, including parallel duplicate, close, revoke/reissue and SQL origin/constraint checks. Twelve isolated fixture events were cleaned with existing data unchanged. Live inactive/invalid-assignment DB-profile reload remains unverified (service-context rejection tested); mobile HTTPS UAT is pending. Frontend `/scan` joins the existing authenticated shell, lazy-loads qr-scanner with worker fallback and stops media tracks after scanning and releases its worker/media on navigation or retry. No Activity, manual/audit/report or new auth system.

### Phase 6 manual attendance and reporting boundaries

Flat protected Attendance procedures: manualInsert, manualCorrect, auditHistory, recap, ownHistory and exportCsv. `manual-attendance.ts` owns transactions/state/participant checks; `reporting-policy.ts` owns time/presence/lateness/CSV rules; `reporting.ts` selects safe DTOs. Identity public getCheckInSr reloads/share-locks live operator and getActiveSrCandidate validates new targets without requiring their first-login completion. No direct private Identity table reads. Writes lock event → session → record; correction reads current locked before-state and commits/rolls back with audit. Recap uses read-only repeatable-read, own history is bounded/session-bound. UI reuses the shared shell, flat Attendance features and thin `/attendance/history` route.

KADEP HCO alone may insert/correct/audit attendance on PUBLISHED with INACTIVE/ACTIVE session or CLOSED/CLOSED, never DRAFT. Effective time must be <= server now and, for CLOSED, <= events.closed_at; CLOSED insertion requires explicit time. No scheduled-end cutoff or extra backdate window. Existing records of inactive historical invitees may be corrected, but new inactive/ineligible insertion is denied. Preserve original recorded_at, source, recorded_by_user_id, initial manual_reason and GPS; update only attendance_at/timing_class/updated_at and append mandatory-reason before/after audit atomically. Manual operations cannot reopen event/session/QR or change snapshots/frozen policy.

HCO recap/CSV starts from every invitation snapshot LEFT JOIN records by session/user. Presence is derived PRESENT/PENDING/ABSENT, with missing time/timing/source/duration NULL. Lateness is max(0, ceil(minutes after grace)), zero for EARLY/ON_TIME. Own history is session-user-only with bounded pagination, no arbitrary userId. UTF-8 CSV uses quoting/formula defense, an apostrophe text marker retaining NIM leading zeros without formulas, WIB timestamps and blank missing fields. No raw GPS, credentials or internal audit JSON. GPS/audit/export retention and export-access audit remain release decisions.

Phase 6 migration `20261012071912_phase6_reporting` was applied with separate PM approval to verified Supabase Development using Session Pooler 5432 and verified TLS. History contains six matching migrations, no pending migration. Seventeen real PostgreSQL test groups passed (12 rollback-based, five committed concurrency cases), including audit guards, rollback on audit failure, manual/QR uniqueness, correction chain and concurrent close. Six temporary events rolled back completely; one explicitly approved concurrency fixture remains CLOSED with two records/four immutable audits. Data outside the fixture was unchanged. Live inactive-target/historical-inactive and additional role combinations remain unverified; Phase 7 does not mutate remote identities or repeat those suites. Manual frontend/HTTPS field UAT remains pending.

### Phase 7 transport security and CI (2026-10-12)

Express rejects foreign Origin on tRPC and requires exact configured frontend Origin for unsafe methods before session/DB work; originless GET remains available for Next SSR. CORS grants credentials only to that exact origin. Auth endpoints retain Better Auth trusted-origin/CSRF checks, HttpOnly/SameSite=Lax/Secure-on-HTTPS cookies, closed public signup, mandatory-password and active-SR gates. Trust proxy stays false; development uses the socket and the production NPM path uses authenticated single-IP metadata (section 10.2). Live proxy verification and multi-worker limiter deployment remain release gates.

Express/Next add nosniff, DENY framing and strict-origin-when-cross-origin; Next disables framework disclosure and allows camera/geolocation only for self (no restrictive CSP that would break Next assets). Auth/tRPC HTTP responses use no-store. Frontend query errors use safe messages; scanner releases captured media tracks on stop/unmount/late start and invalidates Attendance queries on success. Manual mutation invalidation already refreshes recap/audit/history. Draft and manual datetime inputs explicitly use WIB, independent of device timezone; server storage remains UTC. Raw QR/GPS/credentials are excluded from general DTOs/CSV/logging; audit access stays KADEP HCO only.

PR CI (`.github/workflows/ci.yml`, `CI — Code Quality`) targets dev, staging and main with read-only token, pnpm from pinned packageManager, Node 24 and Bun 1.3.13. Frozen install runs existing Varlock postinstall; synthetic nonfunctional env values satisfy validation without real credentials. Route typegen precedes typecheck in clean checkout; Biome, offline targeted tests and production build are required. No DB services, migration/seed/provisioning, deployment or real secrets. Local validation does not prove a GitHub Actions run; remote CI remains pending PR execution. Root tmp/temp are Git-ignored one-off artifacts, excluded specifically from Biome without disabling source rules. Docker validation (`CI — Docker Build`) runs only on PRs to staging, with read-only permissions, integration merge checkout and no registry login/push. Staging pushes trigger `CD — Publish Images`, which uses the built-in package-write token and a serialized publication group to build/publish the two linux/amd64 GHCR images with the same full staging commit SHA. No container build/publication runs on main. Staging/home-server and production/VPS deployment stay manual; production reuses the image SHA/digests approved by staging UAT, even if the main merge SHA differs. See [CI/CD and promotion runbook](setup.md#11-permanent-cicd-and-artifact-promotion-configured-remote-runs-unverified).

## Broadcast / Pengumuman SR — Fase B1

B1 implements only database, Identity policies and `packages/api/src/modules/broadcast/{broadcast.schema,broadcast.service,broadcast.router}.ts`; [approved behavior](prd.md#63-broadcast--pengumuman-sr--b1). No frontend, notifications, targeting, attendance integration, scheduler or new dependency is added. B2/B3, browser UAT and production release remain pending.

**Storage:** additive Drizzle migration `20261026013410_dashboard_broadcast` follows `20261025050126_committee_event_snapshots`. `broadcasts` stores UUID, trimmed title/content, optional HTTP(S) link, creator/editor user FKs, publication/expiry/archive and creation/update timestamptz. Noncascading FKs preserve author references. CHECKs bound text lengths, URL protocol/length and `published_at < expires_at <= published_at + interval '168 hours'`. Indexes support publication/UUID ordering, unarchived expiry and FK lookups. RLS is enabled without client policies; PUBLIC/anon/authenticated grants are revoked following other server-only tables. Runtime uses the existing trusted server DB role, not a Supabase client role. Previous migrations and committee/attendance schemas are unchanged.

**Authorization:** `canReadBroadcast` accepts backend-verified eligible SR and valid SUPERADMIN; `canManageBroadcast` additionally requires structural INTI or structural KADEP unless SUPERADMIN. These policies neither read committee roles nor change event/attendance permissions. Protected procedures retain the password gate; services reload the live identity using existing locks/reference/tenure validation for reads and writes. A write locks its broadcast first (`FOR UPDATE`), then rechecks identity and ownership. Creator demotion/revocation/deactivation blocks later management. SUPERADMIN may manage others' broadcasts. History joins only the creator's display name, so creator deactivation does not erase historical announcements.

| API | Input | Result / behavior |
| --- | --- | --- |
| `broadcast.list` | `{view?: 'ACTIVE' \| 'HISTORY', limit?: number, offset?: number}` | Defaults ACTIVE/10/0; limit 1–50; nonnegative integer offset <= 1,000,000; `{items,total}`; newest publication then UUID descending |
| `broadcast.latest` | No input | Up to three ACTIVE DTOs, array or `[]`; client limit rejected |
| `broadcast.detail` | `{broadcastId}` UUID | Safe DTO including derived ACTIVE/HISTORY |
| `broadcast.create` | `{title,content,linkUrl?,expiresAt?}` | Server creator and timestamps; expiry defaults to +168h; returns `{id,publishedAt,expiresAt}` |
| `broadcast.update` | `{broadcastId,title,content,linkUrl?,expiresAt?}` | Full text replacement; omitted/null link clears it, omitted expiry preserves it; `{success:true}` |
| `broadcast.archive` | `{broadcastId}` | Owner with current manage permission or SUPERADMIN; `{success:true}`; no physical deletion |

`expiresAt` is an absolute ISO datetime with timezone. Strict Zod objects reject forged owner/publication fields, invalid dates, HTML tags, unsafe protocols and overlong text/links. Content remains plain text: B2 must render it as text, never raw HTML. Safe DTOs expose only `id,title,content,linkUrl,creatorName,publishedAt,expiresAt,archivedAt,status,canEdit,canArchive`; no profile, credentials or internal user IDs. Capability flags are presentation hints, never authorization.

**Time and concurrency:** use database `clock_timestamp()` after lock waits; compare to the same captured server time within the request. Edit preserves original `published_at`/`created_at`/creator. Expiry cannot be past/present or exceed the original seven-day window. Active means `archived_at IS NULL AND published_at <= now AND expires_at > now`; History means archived OR expired. Expired/archived writes return CONFLICT; archive/update serialize, so updates cannot reactivate an archived row. No restore/delete route exists. Stable errors include `BROADCAST_ACCESS_DENIED`, `BROADCAST_NOT_OWNER`, `BROADCAST_NOT_FOUND`, `BROADCAST_EXPIRATION_INVALID`, `BROADCAST_EXPIRATION_EXCEEDS_SEVEN_DAYS`, `BROADCAST_ALREADY_ARCHIVED`, `BROADCAST_EXPIRED`; unexpected write errors are sanitized. Listing uses fixed database time for pagination/count; concurrent content changes may appear on a subsequent request.

**Verification / reproduction:** `pnpm test:broadcast` runs schema/policy/input tests and an opt-in PostgreSQL suite; unset `RESORA_BROADCAST_TEST_DB_URL` skips live tests. For integration use only a newly created disposable PostgreSQL cluster and empty database `resora_test_broadcast`, explicit `postgresql://<scratch-role>@127.0.0.1:<scratch-port>/resora_test_broadcast`. The suite verifies connected host/port/role/name/empty schema before migrations and synthetic fixtures. It creates local Data API test roles; never point it at an existing operational cluster or Supabase. Dispose only that test cluster after execution.

B1 verification covers migration sequence/hash compatibility, unchanged snapshot ancestors, database CHECK/FK/RLS/grants, role matrix, live revocation/demotion, safe DTOs, ownership/SUPERADMIN override, expiry boundaries, pagination/latest/history, rollback and concurrent archive/update. CLI commands: `bun --no-env-file test packages/api/src/modules/broadcast/broadcast.test.ts packages/db/src/schema/broadcast.test.ts packages/api/src/modules/identity/identity-policy.test.ts`, separately the opt-in `broadcast.integration.test.ts`; affected DB/API/server typechecks, scoped Biome, backend build and diff checks. Migration application to DEV/PROD requires separate review and the existing `pnpm db:migrate <target>` workflow; none is performed during B1 implementation.

Local B1 evidence (2026-10-26): 55 focused offline schema/policy/input/migration-CLI tests and 31 committee/attendance/check-in regressions passed; eight integration test groups passed on verified PostgreSQL 18 loopback scratch storage, including all 20 migration hashes in order. Workspace typecheck (six packages), scoped Biome and server build passed. These results do not certify Supabase runtime-role grants or apply the new migration remotely. No browser UAT or B2 frontend is included.

## SA-02 account administration

Identity owns flat protected `listAccounts`, `accountReferences` and `createAccount` procedures. All use `hasSuperadminPrivilege`; creation reloads/share-locks current identity/grant, validates active DB references, shares the CSV provisioning advisory lock and relies on DB uniqueness. The extracted `sr-account.ts` helper keeps Better Auth internal user/credential and profile creation shared with CSV provisioning; private backend auth configuration binds the adapter to the same Drizzle transaction. Account creation/audit are atomic and public signup remains disabled.

Thin `/admin/users` routes reuse the authenticated shell and add a session-backed admin layout gate. Backend session `isSuperadmin` controls desktop/mobile Administrasi navigation; direct backend authorization remains decisive. Listing has stable pagination (default 20, max 50), search and filters, and excludes credentials. Creation uses the existing tRPC client directly so the one-time plaintext response is absent from TanStack query/mutation cache and browser storage. Existing Express API `Cache-Control: no-store` applies; no credential URL/logging/email delivery is introduced. Success state is cleared when finished. Network/commit uncertainty tells the administrator to inspect the list before retrying, not that creation definitely failed. SA-02 was accepted by PM; its audit migration is tested locally during SA-03 and still requires remote application approval. No remote mutation or new deployment is performed.

## SA-03 dedicated administrative identity

Auth `getActiveIdentity` returns a discriminated SR/SYSTEM_ADMIN union; SR fields never exist on a system identity. SR participant contracts remain `getActiveSr`, directory/candidate and check-in reads. Authentication/session/protected procedures reload active identity/grant, and first-password-change clears the flag for both supported actors. Identity public `getLiveOperationalIdentity` share-locks profile/user/grant and validates current SR reference eligibility only for SR; it is not an attendance-participant resolver. Domain state/target/invitation/audit checks remain unchanged.

Session/profile/dashboard DTOs expose actor plus NIM for SR or username for SYSTEM_ADMIN. The existing layout, profile/password/theme/logout and sidebar are reused; system users see HCO/Administrasi, without Scan/own history. `SYSTEM_ADMIN` is the account actor, `SUPERADMIN` remains its required explicit privilege. Existing explicit SR grants still require valid assignment.

Standalone CLI bootstrap has no runtime startup path, public endpoint, imported `.env`, DATABASE_URL/PROD_* fallback or automatic migration. It verifies explicit target and the complete versioned migration hashes, uses an advisory lock for one dedicated account, and preserves private write-before-commit credential export. A nullable audit actor is permitted only for SYSTEM_ADMIN_BOOTSTRAPPED; ACCOUNT_CREATED still requires a real actor. Existing append-only guards remain. See [manual bootstrap/runbook](superadmin-bootstrap.md). SA-02/03 migrations and integration were exercised only on isolated loopback PostgreSQL, never remote databases.

### Event location picker (2026-10-19)

The Attendance event form loads Leaflet only in the browser, with OpenStreetMap raster tiles and visible attribution. Click/tap, marker dragging, and a keyboard-accessible center-selection button update the existing centerLat/centerLng payload; a circle previews the configured radius. Explicit zoom-in/out buttons, mouse-wheel zoom and touch pinch zoom are enabled; zoom level zero is preserved when synchronizing the pin. Tiles require internet access and send normal tile requests to OpenStreetMap; no API key is required. Existing edit capabilities and server coordinate validation remain authoritative. No schema change is required.

### Authenticated workspace presentation (2026-10-19)

The authenticated AppShell owns `.resora-workspace`; its CSS refines existing RESORA tokens, cards, forms, tables and touch targets only inside that boundary. Welcome/login retain their existing styles. The workspace keeps Geist, Lucide and the existing web compatibility APIs backed by shared shadcn Card/Button and input/select/dialog components; no UI dependency or additional component framework is introduced. A white sidebar and the same global light background as welcome/login provide a consistent RESORA surface; primary actions retain RESORA red. The existing theme provider defaults to light, with dark/system modes available only through user preference. No fixed dark sidebar palette is applied. Dark mode and reduced-motion preferences remain supported.

The dashboard stays a server component, uses the existing verified session and shows navigation according to SR/HCO/SUPERADMIN capabilities; it does not invent analytics or introduce polling. Dashboard content is limited to one greeting, a primary action and compact links; account identifiers are in a closed native details element. The event list shows title/status/schedule and a detail link, without summary metric cards or duplicated descriptions. Sidebar destinations are grouped into global SR features, HCO department operations and SUPERADMIN administration; creation actions remain in their management pages. Database backup is collapsed by default, with warnings still shown before its action becomes available. Account rows stack into name/NIM/status below 640px, with email/organization behind a native details element, and remain a complete table on wider screens; other wide operational tables retain their existing overflow containers. New workspace controls have at least 44px mobile targets. Source/CLI verification does not replace keyboard, screen-reader and responsive visual UAT at 375/768/1024/1440px in light/dark modes. See the separate [frontend complexity audit](reviews/frontend-ponytail-audit.md) for unapplied cleanup proposals.

### Sidebar groups and icon rail (2026-10-19)

AppShell uses the official shadcn Base Lyra Sidebar/Sheet primitives with `collapsible="icon"`; a 72px desktop rail preserves clickable icons, accessible names, tooltip labels and the account dropdown when collapsed. Global, department and system administration destinations are separately configured in `config/navigation.ts` and filtered only by existing backend session capabilities. HCO is the currently implemented department group; no placeholder departments, permissions or future routes are introduced. The server remains authoritative. The active group follows management query state plus create/edit child routes.

Sidebar, Sheet and Avatar source is adapted from the official registry; unused optional primitives, cookie writing and the old native drawer are omitted. Existing shadcn Button, Tooltip, Skeleton and DropdownMenu are reused. The shadcn mobile hook is aligned to the existing 1024px desktop breakpoint. Mobile uses a focus-managed Sheet, closes on navigation and desktop resize, and always displays full labels independently of desktop collapse state. Sidebar surface/accent tokens match RESORA light/dark palettes. Width and icon feedback use 180–200ms transitions with reduced-motion overrides. Uiverse animated navigation controls were consulted as interaction references; implemented controls use shadcn primitives. Third-party license attribution is in `packages/ui/THIRD_PARTY_NOTICES.md`.

Validation remains CLI-only unless browser UAT is explicitly authorized; keyboard/focus return, mobile nested account menus, rail tooltips and responsive animation need manual verification. No database, remote environment, dependency installation or other page redesign belongs to this sidebar change.

### Workspace page presentation (2026-10-19)

Dashboard, event list and own attendance history reuse the existing shared shadcn Card primitives; the dashboard primary action uses a native Link styled with shadcn buttonVariants. Dashboard navigation retains the verified session capability matrix, with one primary action and separate workspace links. Event rows and history share a compact WIB date-range formatter; event rows expose schedule, status and detail action; history uses aligned desktop columns and stacked mobile articles with localized timing labels. Existing queries, server authorization and pagination contracts are unchanged. Shared page styles retain RESORA tokens, 44px actions and 180ms hover feedback with reduced-motion overrides. The shared inline loading spinner is adapted from Uiverse AHMED-MIT/curly-rabbit-4, uses currentColor and supports reduced motion; its source and MIT notice are recorded in packages/ui/THIRD_PARTY_NOTICES.md. No additional dependency is installed. Responsive visual and assistive-technology UAT remains required.

### Frontend consistency consolidation (2026-10-19)

Web Card, Button and Skeleton compatibility components now delegate to the existing shared shadcn primitives, preserving their public props, form button type, loading/disabled behavior and legacy content spacing. Profile and sidebar use the shared shadcn Avatar. Operational pages share the 72rem page container, with centered narrow account forms and an intentionally dark camera preview for QR contrast. Workspace cards use a 16px radius, controls use 12px corners, main actions retain 44px mobile targets, and labels use 14px text. Welcome/login layouts are preserved; login inherits the shared Button implementation.

Navigation links use native anchors/Next Link with shadcn buttonVariants rather than Base UI Button render anchors; sidebar and dropdown use their dedicated navigation/menu primitives. Existing backend capability gates, query contracts and operational actions are preserved. The source audit and remaining UAT checklist are in [Frontend UI consistency audit](reviews/frontend-ui-consistency-audit.md).

### Event editor interaction (2026-10-19)

Create and existing FULL/LIMITED/METADATA edits continue to use one editor and the existing payload/mutation gates. Its form now has information, schedule, location/attendance and participant sections. Title/description stack, secondary grace/QR settings use native details, and the existing server-defined numeric bounds are exposed to native validation. A focusable error summary handles native invalid events, opens collapsed invalid controls and links to the field; time/API feedback remains supported. Browser focus/reading-order acceptance still requires UAT.

A disabled fieldset freezes form controls while saving; the existing submission lock also guards location updates, and the picker explicitly disables editable map/preset controls. The single submit action remains in the semantic form and uses a sticky action area offset above mobile quick actions, with selected count and clear draft/audit wording. Native disclosure keeps Dorm Hall compact, automatically opens the map for custom location selection, and moves precise coordinates to secondary details. Leaflet's existing ResizeObserver invalidates the map when its disclosure opens. Keyboard, zoom, dragging and OpenStreetMap attribution are preserved in source. All interaction/collision and map behavior needs browser UAT.

Participant group and individual review areas are separated visually; individual identity uses name then NIM/organization, with a 44px checkbox label target. Union/exclusion rules, cross-page selection, advanced-edit reasons and server eligibility remain unchanged. Loading uses shared shadcn Skeleton; failures use the existing error helper and a retry action rather than attributing every failure to HCO access.

### Date/time controls and detail panels (2026-10-19)

Event start/end and effective manual-attendance timestamps now use shared DateTimePicker, composing official shadcn Base Lyra Calendar/Popover with React DayPicker 9.14.0. Dates can be chosen from an Indonesian calendar or entered as YYYY-MM-DD; hours/minutes use 24-hour selects, with seconds retained for manual attendance. The component emits literal local date/time strings; existing Attendance WIB parsing remains responsible for ISO conversion. Invalid/overflow dates participate in native validity and the editor's error summary. Clearing an optional manual timestamp remains empty for existing server-time behavior. Popovers portal into the nearest native dialog when used by the manual-attendance modal.

Password visibility actions share an absolute full-height 44px-wide control with no press translation; credential state, aria-pressed and submit behavior are preserved. Shared CardHeader has complete padding even when the body is hidden; subsequent body spacing is adjusted with explicit data attributes, and action controls stack on mobile. Event audit actions live in the header; their bodies stay hidden and requests stay lazy until expanded. Closure remains explicitly confirmed and uses the existing operation/capability gates. No deployment or data/schema mutation is part of this change.

### Text containment and analog clock input (2026-10-19)

Event information uses an explicit minmax(0,1fr) single-column grid and shrinkable labels/content. Shared Textarea uses fixed field sizing, zero minimum inline width, wrapping of unbroken text and vertical resizing. Workspace textarea rules preserve a 6rem minimum height, bounded vertical scrolling and 16px mobile text rather than inheriting the 44px single-line input minimum.

DateTimePicker now composes timepicker-ui 4.5.0 in inline mode inside the existing shadcn Popover. Users can drag clock hands, switch the library's clock/keyboard view or type a 24-hour time directly. Time controls enable after a valid date is selected. Confirm commits the selected time; cancel leaves the draft unchanged. Optional seconds and empty manual timestamps retain their prior contracts. The library owns only an isolated uncontrolled input/clock container; initialization/destruction are effect-scoped, and native-dialog popover containment remains supported. RESORA clock palette/sizing use library CSS variables and respect reduced motion. Browser drag/touch, focus and responsive containment still require UAT.

### Administrator account directory cache (2026-10-19)

`identity.accountSnapshot` returns the full projected SR directory to a live authorized SUPERADMIN. The existing bounded `listAccounts` API remains available. Kelola Akun filters name/NIM, department and status and paginates this snapshot locally; typing does not submit or request another page. TanStack Query retains the snapshot in memory until explicit refresh, account mutation invalidation, logout/login or document reload. No personal directory or credential is persisted in localStorage. Authorization and operational eligibility are always server-derived, independent of this display cache. Full-roster payload size should be reassessed if roster volume becomes large.

Administrator reset uses a privileged transaction to lock the target SR profile, replace its credential with a Better Auth hash, revoke all target sessions and append `PASSWORD_RESET`. `password_reset_required` enforces rotation even for ordinary SR; successful native password rotation clears it with the initial-password flag. The one-time plaintext response is held only in component state, not TanStack cache, storage or audit. A failed/lost response must be treated as uncertain and a new explicit reset can issue a fresh credential. Dedicated SYSTEM_ADMIN accounts are outside this reset endpoint's target scope.

### SR tenure model and renewal (2026-10-19)

Two additive tables, `sr_periods` and `sr_period_memberships`, retain period definitions and historical membership. The membership FK targets `sr_profiles`, excluding dedicated administrators at the database boundary; its composite key prevents duplicate assignment and the reverse FK is indexed. Existing `account_audit_logs.details` records period creation/extension before/after values and per-user assignment using the append-only audit guard. Period writes serialize on an Identity advisory lock and recheck live administrative privileges inside each transaction. Extension only increases the end date; renewal appends a membership rather than replacing the old one. Manual inactive state is never reset by assignment.

The account snapshot includes period history and a statement-time, Jakarta-calendar tenure projection. The UI can create periods, extend a shared period and assign up to 200 selected members per operation across account pages; new-account UI requires a period. Existing provisioning/API clients may create unassigned records, which must be assigned before login once enforcement is enabled. No existing roster is modified or assigned by the migration. These commits are preparatory until the accompanying access enforcement is included.

Tenure enforcement is implemented in live `getActiveIdentity` and Identity's active directory/check-in/manual-target interface. Only SR with a current period is eligible, including SR with SUPERADMIN; SYSTEM_ADMIN bypasses tenure only, retaining active-account/grant/password checks. Expiry is a computed archive state rather than a scheduled destructive update or an overloaded `is_active` flag. Renewal therefore preserves manual deactivation, account IDs and historical records. No cron or table movement is needed. Directory reads re-evaluate statement time after row-lock waits. Correlated tenure/history SQL explicitly qualifies outer table and column identifiers so single-table Drizzle projections cannot accidentally match another SR's memberships.

The native username plugin verifies the password before the session-create hook. That hook emits `SR_TENURE_EXPIRED` with `maaf periode jabatan anda telah purna` for expired SR, or `SR_TENURE_NOT_ACTIVE` for unassigned/future-only SR; wrong credentials retain the generic denial. Existing sessions are rejected on their next protected request. The account list derives display state from cached dates using the Jakarta calendar (checked every minute), so midnight does not require a directory refetch. Server eligibility never uses client time or cache.

The public Express `/api/auth/change-password` route uses `handlePasswordChangeRequest`: a transaction-bound native Better Auth instance locks the same profile row as administrator reset before revalidating the session and verifying/updating credentials. Credential replacement, session replacement and gate release therefore serialize with reset; a stale password-change request cannot overwrite a completed reset. Error responses after possible writes roll back, including failed replacement-session writes. Native 400 validation/password-mismatch paths occur before credential writes and commit their production database rate-limit counters. Missing server auth configuration fails closed with 503. Internal code must use this transaction-bound handler for HTTP password changes, not invoke a separate unguarded native rotation path.

Opt-in legacy test suites explicitly assign synthetic active tenure through the loopback/scratch-only `sr-tenure.fixture.ts` helper, rather than weakening production unassigned-account denial. They remove fixture memberships before deliberate profile cleanup/reassignment. The dedicated bootstrap suite uses an isolated ignored credential root and cleans it afterwards; tests do not change private-directory permissions belonging to the user.

The tenure tables have RLS enabled and no direct client policies. The `sr_tenure_server_only` migration revokes privileges from PUBLIC and existing `anon`/`authenticated` roles to counter staging's automatic public-table grants, including privileges outside RLS such as TRUNCATE. Database access remains server-only through a role allowed to access the tables; the configured staging runtime role was verified to bypass RLS. These grants are scoped to the two new tables, with no global default-privilege changes.


### Administrator management UI and maintenance boundary (2026-10-19)

`/admin/users` is the cached account directory; `/admin/periods` is the period workspace. Both use the same server access guard and shared TanStack account snapshot. Search, selection and pagination stay local. Successful writes invalidate the snapshot; explicit refresh remains available. The shared Base UI/shadcn dialog provides focus containment and accessible title/description; plaintext reset credentials remain only in component state and are cleared on close. Component sources and adapted Uiverse decoration are recorded in [UI attribution](ui-attribution.md).

Identity `updateAccount` / `archiveAccount` recheck live SUPERADMIN authorization inside the transaction, lock the SR profile, validate the expected profile timestamp and revoke target sessions atomically with the write/audit. Updates validate active organization references and allowed department/position pairs; NIM/privileges cannot be forged through these inputs. Email changes clear email verification. The existing `is_active=false` flag represents manual archival; no additional archive table/column or destructive delete is needed. Period-driven purna remains derived separately. SYSTEM_ADMIN cannot be targeted through SR maintenance.

Migration `20261019033819_admin_account_maintenance` only expands the audit action constraint with ACCOUNT_UPDATED and ACCOUNT_ARCHIVED; it does not rewrite historical records or change user data. Existing audit append-only enforcement stays intact. The new migration must precede edit/archive use; it has been exercised on isolated local PostgreSQL, not applied remotely in this task.

### Manajemen Kepanitiaan — Fase 1–4

Satu kepanitiaan (misalnya Welcoming Day) dapat dipakai oleh beberapa event absensi. Fase 1 menyediakan schema/policy; Fase 2 menyediakan CRUD tRPC dan UI; Fase 3 menyediakan event/snapshot independen; Fase 4 menyediakan rekap/filter per event dan implementasi CSV 14 kolom. Validasi fungsional CSV **PENDING UAT Fase 5**. Perubahan kepanitiaan tidak menulis ulang bukti kehadiran historis.

- `committees`: UUID, nama nonblank, deskripsi default kosong, pembuat FK ke `user.id`, serta waktu pembuatan/perubahan `timestamptz` sesuai konvensi Drizzle.
- `committee_divisions`: divisi dinamis milik satu kepanitiaan. Nama nonblank dijaga unik per kepanitiaan melalui indeks `(committee_id, lower(btrim(name)))`; nama yang sama boleh digunakan oleh kepanitiaan berbeda.
- `committee_members`: PK `(committee_id, user_id)` membatasi satu divisi/jabatan per SR per kepanitiaan. SR dapat mengikuti beberapa kepanitiaan. `user_id` mengacu ke `sr_profiles.user_id`, sehingga akun sistem tidak menjadi anggota SR. FK komposit `(committee_id, division_id)` mengacu ke unique `(committee_id, id)` milik divisi, mencegah divisi lintas kepanitiaan.
- Jabatan kepanitiaan: `ANGGOTA` (Anggota), `SEKDEP` (Sekdep), `KADEP` (Kadep), `SEKRE` (Sekre), `BENDAHARA` (Bendahara), `PIC1` (PIC 1), `PIC2` (PIC 2), `PJ` (PJ). CHECK PostgreSQL membatasi nilai tersebut. Ini bukan jabatan struktural; `positions` dan `sr_profiles` tidak berubah.
- Semua FK baru memakai NO ACTION, bukan cascade. Divisi yang masih dipakai anggota tidak dapat dihapus; anggota harus dikeluarkan/dipindahkan secara eksplisit. Indeks mendukung lookup pembuat, anggota per SR, dan anggota per divisi. Ketiga tabel memakai RLS tanpa policy client dan mencabut grants PUBLIC/`anon`/`authenticated`, mengikuti pola server-only yang ada.
- `canManageCommittee` pada policy Identity hanya mengizinkan SUPERADMIN sah atau SR struktural HCO/KADEP, memakai identitas backend yang sudah diverifikasi live. Gate aktif, tenure, assignment dan rotasi password tetap berlaku. KADEP kepanitiaan tidak memperoleh permission struktural HCO. Permission event/manual attendance lain tidak berubah. Session DTO menambahkan capability `canManageCommittee` dari policy backend untuk guard/navigasi, bukan sebagai sumber otorisasi write.

FK tidak menjamin keaktifan atau tenure SR. Service Fase 2 memakai `getActiveSrCandidate` untuk penambahan/perubahan penugasan: SR aktif, referensi organisasi aktif, assignment struktural valid dan tenure ACTIVE. Setiap mutasi mengunci row kepanitiaan lalu memeriksa ulang operator melalui `getLiveOperationalIdentity` dalam transaksi. Perubahan divisi/anggota dan timestamp kepanitiaan atomik. Constraint unique/FK menjadi pengaman terakhir; konflik dipetakan ke error aman. Tidak ada cascade, perubahan profil SR, atau trigger eligibility baru. `updated_at` mengikuti mekanisme Drizzle dan disentuh pada mutasi anak.

Modul feature-first `packages/api/src/modules/committee` menyediakan protected procedures berikut:

| Procedures (`committee.*`) | Akses | Perilaku |
| --- | --- | --- |
| `list`, `detail` | `canManageCommittee` **atau** `canManageInternalEvent` | DTO eksplisit; list mencari nama, default 20/maksimal 50, urutan nama/UUID; jumlah divisi/anggota dihitung dalam query yang sama tanpa N+1. Detail mencakup identitas anggota termasuk yang tidak lagi eligible. |
| `candidates` | `canManageCommittee` | Pencarian nama/NIM minimal 2 karakter, maksimal 20 SR eligible yang belum menjadi anggota. |
| `create`, `update`, `delete` | `canManageCommittee` + live recheck | Nama trim 1–150 karakter, deskripsi maksimal 2000; pembuat dari sesi; delete hanya tanpa divisi/anggota/referensi FK. |
| `createDivision`, `updateDivision`, `deleteDivision` | Sama | Nama trim 1–150 karakter; unik case-insensitive per pemilik; delete ditolak jika masih dipakai. |
| `addMember`, `updateMember`, `removeMember` | Sama | Divisi wajib milik kepanitiaan yang sama; posisi dari konstanta Fase 1; update target harus eligible. Remove tetap diizinkan untuk anggota yang sudah inactive/expired/unassigned. |

Pengelola event HCO selain KADEP dapat membaca data lewat API untuk memilih kepanitiaan pada form event; tidak dapat menulis atau membuka UI pengelolaan. `/committees` dan `/committees/[committeeId]` memakai authenticated layout, guard `canManageCommittee`, serta menu HCO yang sama pada desktop/mobile. Alur: cari/buat kepanitiaan → kelola identitas → tambah/ubah divisi → cari SR eligible → pilih divisi/jabatan → simpan. Pencarian kandidat dibatasi, daftar anggota dipaginasi 15 per halaman. Dialog menahan close/double-submit saat pending, mempertahankan isian jika gagal, dan menginvalidasi query setelah sukses. Hapus kepanitiaan/divisi atau keluarkan anggota memerlukan konfirmasi eksplisit. Keanggotaan tidak eligible tetap terlihat dan dapat dibersihkan, tetapi tidak bisa diberi penugasan baru.

Migration additive `20261024151434_committee_foundation` dihasilkan pada Fase 1 melalui `pnpm --filter @resora/db db:generate --name=committee_foundation`, dengan tambahan pencabutan grants server-only sebagaimana migration tenure. Migration ini wajib tersedia sebelum memakai CRUD Fase 2; Fase 2 tidak menambah migration atau mengubah snapshot/SQL historis. Tidak ada perubahan schema/data event atau absensi. Setelah review dan otorisasi target, gunakan workflow [migration CLI](setup.md#current-supported-supabase-migration-workflow): `pnpm db:migrate dev --check`, lalu `pnpm db:migrate dev`; Production tetap memerlukan persetujuan terpisah, recovery plan dan konfirmasi project. Tidak ada migration remote yang dijalankan pada implementasi ini.

#### Integrasi event kepanitiaan — Fase 3

Form create/edit DRAFT menyediakan **Kepengurusan Event**: Struktural SR atau Kepanitiaan Kegiatan. Pilihan kepanitiaan memakai `committee.list/detail` (pencarian/pagination), tanpa memberi hak CRUD kepada HCO non-KADEP. Mengganti konteks atau kepanitiaan pada DRAFT mengosongkan kelompok/include/exclude sebelumnya. Loading/error/retry tersedia; snapshot PUBLISHED menjadi basis checkbox FULL edit, termasuk identitas historis yang sudah tidak aktif.

Migration additive `20261025050126_committee_event_snapshots` dihasilkan melalui `pnpm --filter @resora/db db:generate --name=committee_event_snapshots`. `events.organization_context` adalah text NOT NULL default SR; CHECK mewajibkan SR tanpa `committee_id`/snapshot nama, atau COMMITTEE dengan FK valid ke `committees`. FK NO ACTION dan indeks `events_committee_idx` melindungi referensi tanpa cascade. `snapshot_committee_name` nullable saat DRAFT dan wajib nonblank setelah publikasi COMMITTEE. Event lama otomatis SR. `event_participants.snapshot_committee_division/position` nullable berpasangan; CHECK posisi menggunakan konstanta Fase 1. Snapshot identitas/jabatan struktural dan attendance records tidak berubah. SQL/snapshot historis tidak diedit; tidak ada migration remote pada implementasi ini.

`attendance.create/editDraft` memvalidasi konteks dengan Zod; konteks yang dihilangkan klien lama diperlakukan SR. SR memakai union kelompok existing, deduplikasi dan exclusion yang sama. COMMITTEE melarang allSr/departemen/INTI/KADEP; roster adalah `(anggota panitia eligible ∪ individuals ∪ include) − exclude`, unik per userId. Eligibility tetap dari direktori Identity (aktif, assignment valid, referensi aktif, tenure ACTIVE), bukan FK membership. `preview` menggunakan resolver yang sama dengan `publish`. Undangan non-panitia menyimpan kedua snapshot panitia NULL.

Publikasi atomik membekukan roster, identitas struktural, divisi/jabatan panitia dan nama kepanitiaan, tanpa mengaktifkan sesi. Pada jalur roster, committee SHARE diperoleh **sebelum event UPDATE → session UPDATE → live operator → directory SHARE**, selaras dengan committee CRUD yang mengunci committee UPDATE lebih dahulu. Pergantian DRAFT mengunci kedua committee ID secara berurutan; hint ID dibaca lalu diperiksa kembali setelah lock event. Bila ID berubah saat menunggu, operasi CONFLICT, tanpa mengambil lock committee baru setelah event. Ini juga menghindari siklus dengan pemeriksaan FK saat penghapusan kepanitiaan. Jalur QR/manual/close yang tidak membaca committee tetap memakai urutan existing event → session.

Setelah publikasi, context/committeeId tidak dapat diganti. Rename/move/remove anggota tidak menyinkronkan event lama. FULL edit SUPERADMIN hanya berlaku PUBLISHED + INACTIVE tanpa attendance: basisnya **event_participants saat ini**, bukan membership live. Include/individuals menambahkan undangan eksplisit yang eligible; exclude menghapus undangan. Peserta yang bertahan tidak ditulis ulang, termasuk snapshot dan invitedAt. Peserta baru mengambil identitas/penugasan terkini; snapshot nama event tetap pada publikasi awal. Audit existing mencatat delta jumlah/ID, reason dan operator dalam transaksi yang sama. Kriteria tidak berubah berarti tidak ada sinkronisasi peserta. SR advanced edit dan batas LIMITED/CLOSED tetap kompatibel. Detail hanya mengembalikan roster kepada operator; SR biasa hanya melihat konteks/nama event sesuai akses undangan existing.

Rekap/filter dan implementasi CSV Fase 4 dijelaskan di bawah. Rekap gabungan lintas event tetap di luar scope. Perubahan CSV, QR, geofence, auth dan permission kepanitiaan tidak termasuk Fase 3. UAT browser/mobile/keyboard tetap gate PM setelah migration diterapkan secara terpisah.

#### Rekap berdasarkan kepengurusan — Fase 4

Prasyarat tetap migration Fase 3 `20261025050126_committee_event_snapshots`; Fase 4 tidak menambah migration. `attendance.recap({ eventId })` mempertahankan MVCC read-only `repeatable read`, status PRESENT/PENDING/ABSENT, waktu, lateness, source dan izin manual/audit. `event` menambahkan `organizationContext` serta `committeeName` dari `events.snapshot_committee_name` (NULL untuk SR). Peserta menambahkan `committeeDivision/committeePosition` nullable dari `event_participants`. Tidak ada join ke committees/membership live. SR lama tetap memakai snapshot struktural; ordinary SR tidak memperoleh recap administratif.

Helper murni `reporting-context.ts` dipakai UI/server. SR menggunakan departmentCode/positionCode; COMMITTEE menggunakan divisi/posisi snapshot panitia dan label jabatan Fase 1. Kedua snapshot panitia NULL berarti **Non-Panitia / Undangan**, tanpa fallback ke jabatan struktural. Label jabatan direuse dari `committee-positions.ts`; jabatan panitia tidak menjadi permission sistem.

Rekap menampilkan konteks/nama historis, mengutamakan divisi/jabatan panitia dan mempertahankan info struktural sekunder. Opsi filter berasal hanya dari snapshot event: division (departemen SR atau nama divisi panitia), position (kode jabatan), participantType ALL/COMMITTEE/GUEST (hanya COMMITTEE), serta pencarian nama/NIM case-insensitive. Semua kondisi dikombinasikan AND sebelum pagination lokal 15 peserta. Perubahan/reset filter kembali ke halaman pertama; event berganti me-remount state. Statistik global tidak difilter, jumlah hasil ditampilkan terpisah. Loading/error/retry/empty state dan keyboard controls tetap tersedia.

`attendance.exportCsv({ eventId, division?, position?, participantType?, search? })` memvalidasi input strict Zod (division/search maksimal 150 karakter; position 50). Tanpa filter: seluruh undangan; filter diterapkan server pada snapshot event yang telah diotorisasi, bukan pada ID dari frontend. participantType selain ALL untuk SR ditolak BAD_REQUEST. Izin recap/export tetap `canManageInternalEvent`, tanpa perubahan manual/audit. Filter tidak mengubah data historis.

CSV mempertahankan urutan awal: **NIM, Name, Department, Position, Building, Presence, Attendance At (WIB), Timing Classification, Late Minutes, Source**. Ditambahkan **Organization Context, Committee, Event Division, Event Position** (total 14). Department/Position tetap snapshot struktural. SR: Committee kosong, dua field event memakai kode struktural. COMMITTEE: Committee nama historis; divisi snapshot dan label jabatan panitia; kedua field event memakai Non-Panitia / Undangan untuk tamu. BOM UTF-8, CRLF, escaping, mitigasi formula injection, marker NIM leading zero, WIB, NULL dan urutan NIM/userId tetap dipakai. Filename tetap dari backend.

UI menyediakan Export Semua Peserta (mengabaikan filter aktif) dan Export Sesuai Filter (seluruh hasil, bukan halaman terlihat), beserta jumlah berdasarkan rekap dimuat. Request langsung melalui tRPC client menghindari cache export stale; ref/pending state mencegah double-submit. Mekanisme Blob/download existing dipertahankan.

**CSV fungsional: PENDING UAT.** Tidak ada pemanggilan generator/export atau download untuk verifikasi Fase 4. Tes baru hanya recap/filter/authorization/UI non-CSV; ekspektasi lama yang terdampak penambahan kolom dipelihara secara statis, tidak dieksekusi. Suite campuran CSV/export dikecualikan. PM memverifikasi seluruh 14 kolom, escaping/Unicode/NIM/WIB/NULL, Semua vs Filter dan seluruh hasil lintas pagination pada UAT Fase 5; belum ada browser UAT pada implementasi ini.

Perintah Fase 4 non-CSV dari root:

```sh
bun --no-env-file test packages/api/src/modules/attendance/reporting.test.ts apps/web/src/features/attendance/interaction-ux.test.ts packages/api/src/modules/attendance/event-editing.test.ts packages/api/src/modules/identity/identity-policy.test.ts --test-name-pattern '^(?!.*(?:CSV|csv|export|protected Phase 6 routes)).*$'
bun --no-env-file test packages/api/src/modules/committee/committee.integration.test.ts --test-name-pattern 'Phase 4 recap'
pnpm run check-types
pnpm --filter web build
pnpm --filter server build
```

Command integrasi hanya dijalankan dengan `RESORA_COMMITTEE_API_TEST_DB_URL` pada PostgreSQL disposable yang lolos guard di bawah. Kasus Fase 4 membandingkan rekap dua event setelah rename/pindah jabatan, tamu, filter, manual attendance, lifecycle serta penolakan SR biasa; tidak memanggil export. Jangan memakai test:offline/test:committee tanpa seleksi untuk verifikasi Fase 4 karena suite existing mencakup CSV. Hasil non-CSV dan static checks dilaporkan terpisah dari status UAT CSV.

Targeted checks Fase 1–3 (historis; beberapa suite mencakup CSV):

```sh
bun --no-env-file test packages/db/src/schema/committee.test.ts packages/db/src/schema/committee.integration.test.ts packages/api/src/modules/identity/identity-policy.test.ts
pnpm run test:committee
bun --no-env-file test packages/api/src/modules/attendance/attendance.test.ts packages/api/src/modules/attendance/event-editing.test.ts packages/api/src/modules/attendance/check-in.test.ts packages/api/src/modules/attendance/reporting.test.ts apps/web/src/features/attendance/event-ui.test.ts apps/web/src/features/attendance/interaction-ux.test.ts
pnpm --filter @resora/db check-types
pnpm --filter @resora/api check-types
pnpm --filter web check-types
```

Suite PostgreSQL hanya aktif melalui `RESORA_COMMITTEE_TEST_DB_URL`, tanpa fallback env aplikasi. Target harus database **kosong dan disposable**, bernama `resora_identity_test_committees` di `127.0.0.1`, dengan role/port eksplisit dan tanpa query/hash URL. Suite memverifikasi identitas koneksi, menerapkan chain lokal ke database kosong tersebut, dan memakai fixture sintetis dalam transaksi rollback. Tanpa opt-in, kasus database di-skip; skip bukan bukti integrasi PostgreSQL. Jangan arahkan variabel ini ke Supabase atau database operasional.

Suite API Fase 2: `bun --no-env-file test packages/api/src/modules/committee/committee.integration.test.ts`, opt-in terpisah `RESORA_COMMITTEE_API_TEST_DB_URL`, aturan target sama tetapi nama database **`resora_identity_test_committee_api`**. Suite menerapkan chain ke database kosong yang terverifikasi dan memakai fixture sintetis; buang hanya database scratch milik pengujian setelah selesai. Cakupan: read/write matrix, privilege live/revocation, target eligibility, unique/FK, perpindahan anggota, penghapusan kosong, pagination/count DTO aman dan rollback write terakhir. Tes UI CLI mengeksekusi JSX/callback aktual dengan hook/API doubles untuk form, pilihan anggota, konfirmasi, pending/error/invalidation; ini bukan pengganti UAT browser. Fase 2 tidak mengubah event/QR/rekap; integrasi event Fase 3 dijelaskan berikut.
