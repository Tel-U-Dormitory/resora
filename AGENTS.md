# AGENTS.md — RESORA

> Instructions for coding agents. Read this file **and the relevant PRD** before changing code.
> Project brand **RESORA** is a working name; don't change hard-coded branding without PM approval.

## Sources of truth & priorities

1. `docs/prd.md`: system/product goals, confirmed decisions, MVP boundaries.
2. `docs/modules/need-001/prd.md`: business requirements and tests for the first module.
3. `docs/architecture.md`: runtime, data/auth/security boundaries.
4. `docs/decisions/*.md`: accepted/proposed technical decisions, rationale.
5. R&D planning spreadsheet: stakeholder baseline and 118 **unvalidated legacy** FRs; do **not** assume legacy MVP labels or speculative fields are approved.
6. Actual generated files/configuration after scaffolding supersede **guessed** file paths. Document differences from expected structure.

If specs conflict, stop on the affected behavior, document the discrepancy, and ask the PM. **Do not silently invent business rules.**

## Product constraints

- Four **primary actor categories**: `MAHASISWA`, `SR`, `ASUS`, `DITMAWA`; account has exactly one primary actor. Only SR accounts are provisioned/login-enabled for the NEED-001 pilot.
- SR attributes: **jabatan/position**, **one department** (HCO, Adaptif, Sosial, Akademik, Spiritual, Media, RnD), **one building**. `KADIV` is a position, _not_ a new primary actor.
- Event audience groups are **eligibility predicates**, _not_ primary account roles: `SR` → SR accounts; `ALL_STUDENTS` → `MAHASISWA` and `SR`; `KADIV` → SR whose position is KADIV, independent of department. `ALL_STUDENTS` is **future-ready but not fully usable** until student login is implemented.
- Only HCO members may create/configure NEED-001 attendance events, display/revoke QR codes and review/export attendance. **Only KADIV HCO** can insert or correct manual attendance, with a mandatory reason and immutable audit history.
- Initial superadmin is a system privilege, not a fifth primary actor. Initially only superadmin may change SR department, position, building and active status; do not implicitly bypass attendance permissions.
- Generate participant snapshots when an event is published. Reports include all invited participants, including non-attendees. Inactive accounts cannot authenticate or check in, regardless of snapshots.
- SR may browse eligible events and their own attendance/participation history. Enforce all policy on backend procedures.
- Event-bound, unpredictable QR token; default lifetime **six hours from activation**, configurable per event, static with no automatic rotation. HCO may display it on the event page and revoke it early; reject expired/revoked QR. Allow different invited users to use the same active QR while preventing duplicate attendance per user. **Never trust client-computed position/time/audience/permission**.
- Default geofence radius **20 m**, configurable per event. HCO selects the center by map pin or latitude/longitude; radius is separately measured in meters. Backend validates distance using imperfect/untrusted browser location; failed verification directs the user to KADIV HCO for manual entry. Accuracy threshold and radius bounds remain TBD after field tests.
- QR validity controls check-in, including before scheduled start and after scheduled end. Default late tolerance **15 minutes**, configurable: `EARLY` before start; `ON_TIME` from start through the tolerance boundary inclusive; `LATE` afterward. Presence (`PRESENT`, or missing-record `PENDING` until closure then `ABSENT`) is separate from timing. Event end is not a scan cutoff while QR remains active; attendance-window closure policy remains TBD.
- Manual entry: KADIV HCO opens an event, searches/selects an invited participant by name/NIM and provides a reason. Effective `attendance_at` defaults to server time and may be overridden; classification is automatic. Preserve immutable `recorded_at` and audit every insertion/correction atomically.
- No self-registration. Accounts created via approved provisioning/import; login via **NIM + password** using Better Auth Username Plugin. Initial credentials must be generated and distributed securely; require first-login password change when implemented.
- Every SR has a real email. Authorized CSV import supplies NIM, name, email, department, position, building and active status; real CSV arrives privately before pilot UAT. Use synthetic development accounts meanwhile. Gmail SMTP is planned with sender display name `RnD SR XIV`; sender address/credentials remain environment variables. Password recovery and email verification are Phase 2 work.
- HCO CSV export includes all invitees, NIM/name, organizational snapshot fields, presence, effective attendance timestamp, timing, lateness duration and QR/MANUAL source where relevant. XLSX is optional; never export passwords, session tokens, QR secrets or raw GPS coordinates.
- SSO and university data integration deferred. No fake external adapters or production data in git.
- NEED-001 pilot use deadline: **2026-10-18**; do not claim release-ready until acceptance and UAT pass.

## Engineering conventions

- Stack: Next.js + Express + Bun 1.3.13 + TypeScript + tRPC + Supabase managed PostgreSQL + Drizzle + Better Auth + Docker + Turborepo + Biome. DB access goes through Express only; no Supabase Auth or frontend DB access. VPS deployment is planned.
- Preserve Varlock. Runtime uses `DATABASE_URL` (Session Pooler); migrations prefer `DIRECT_DB_URL`, with explicit IPv6 failure diagnostics and no silent connection switch. Docker PostgreSQL remains optional; see `docs/setup.md` for deliberate Session Pooler alternatives. Never automatically apply remote migrations.
- Package management: pnpm 10.33.4 with `pnpm-workspace.yaml` and `pnpm-lock.yaml`. Use `pnpm install --frozen-lockfile`, `pnpm run`, `pnpm exec` and `pnpm dlx`; do not use `bun install` or `bunx`. Keep Bun for Express runtime, `bun test` and Bun-specific scripts/compilation.
- Use the generated project layout (expected `apps/web`, `apps/server`, `packages/api`, `packages/db`, `packages/auth`, `packages/config`). Verify actual generator output first.
- Use TypeScript strict mode, Zod inputs at trust boundaries, safe DB migrations, and explicit server-side authorization.
- Keep tRPC routers thin; domain/service logic independently testable; database access behind repositories/queries where appropriate.
- Shared QR code **generator/challenge validation** should not depend on NEED-001 attendance business logic; NEED-007 can reuse it later.
- UTC timestamps in storage, explicitly display Asia/Jakarta at the UI. Geospatial units: meters; validate coordinates, accuracy and radii.
- `AttendanceRecord` uniqueness per `(eventId, userId)` enforced in the database. Handle concurrency/retries transactionally. Maintain immutable audit trail for manual edits.
- Never commit plaintext credentials, NIM/password import sheets, secrets, `.env`, geolocation traces or real student data.
- Canonical proposed NEED-001 schema: [data model](docs/modules/need-001/resora-need-001-data-model.md). The actual Drizzle schema currently contains only Better Auth core tables; document discrepancies before changing it.
- Tests: unit for audience, permission, timestamps, location/dedup; integration for tRPC auth/DB concurrency; E2E for HCO publish/snapshot → SR scan → KADIV manual insertion/correction → HCO export including non-attendees.
- Run generated lint/format/typecheck/test scripts; never assume a script name exists without checking `package.json`.
- Do not add Redis, microservices, queues, AI or a new module for unapproved needs.

## Agent working protocol

1. Read task-related docs; label behavior as `CONFIRMED`, `PROPOSED`, or `TBD`.
2. Implement the smallest cohesive change. If the task touches `TBD` business policy, request clarification or hide incomplete behavior behind a flag without faking correctness.
3. Add or update tests, docs and migration notes with any behavior change.
4. Describe touched paths, migration/env impacts, commands run, untested areas and open questions.
5. Do not deploy, import live users, or publish credentials without explicit approval.

## Minimum completion gate for NEED-001

See `docs/modules/need-001/prd.md` and `docs/modules/need-001/acceptance-tests.md`. Completion requires permissions, participant snapshots, audited manual attendance, QR validity/duplication controls, GPS fallback, reporting and pilot UAT; merely rendering a QR or storing a scan is insufficient.
