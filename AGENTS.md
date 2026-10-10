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
- Only HCO members may manage NEED-001 attendance events and review/export event attendance. **Only KADIV HCO** can approve/reject manual correction and modify recorded attendance.
- SR may browse eligible events and their own attendance/participation history. Enforce all policy on backend procedures.
- Event-bound, reusable QR infrastructure; prevent duplicate attendance and token replay; **never trust client-computed position/time/audience/permission**.
- Default geofence radius **20 m (initial configurable default)**; creator may override per event. Treat browser geolocation as imperfect/untrusted; failed checks allow a manual request that requires KADIV HCO approval.
- Default late tolerance **15 minutes** after event start, configurable per event. Check-in must be inside the event attendance window (end/early rules TBD).
- No self-registration. Accounts created via approved provisioning/import; login via **NIM + password** using Better Auth Username Plugin. Initial credentials must be generated and distributed securely; force first-login password reset when implemented.
- SSO and university data integration deferred. No fake external adapters or production data in git.
- NEED-001 pilot use deadline: **2026-10-18**; do not claim release-ready until acceptance and UAT pass.

## Engineering conventions

- Stack: Next.js + Express + Bun + TypeScript + tRPC + PostgreSQL + Drizzle + Better Auth + Docker + Turborepo + Biome.
- Package management: pnpm 10.33.4 with `pnpm-workspace.yaml` and `pnpm-lock.yaml`. Use `pnpm install --frozen-lockfile`, `pnpm run`, `pnpm exec` and `pnpm dlx`; do not use `bun install` or `bunx`. Keep Bun for Express runtime, `bun test` and Bun-specific scripts/compilation.
- Use the generated project layout (expected `apps/web`, `apps/server`, `packages/api`, `packages/db`, `packages/auth`, `packages/config`). Verify actual generator output first.
- Use TypeScript strict mode, Zod inputs at trust boundaries, safe DB migrations, and explicit server-side authorization.
- Keep tRPC routers thin; domain/service logic independently testable; database access behind repositories/queries where appropriate.
- Shared QR code **generator/challenge validation** should not depend on NEED-001 attendance business logic; NEED-007 can reuse it later.
- UTC timestamps in storage, explicitly display Asia/Jakarta at the UI. Geospatial units: meters; validate coordinates, accuracy and radii.
- `AttendanceRecord` uniqueness per `(eventId, userId)` enforced in the database. Handle concurrency/retries transactionally. Maintain immutable audit trail for manual edits.
- Never commit plaintext credentials, NIM/password import sheets, secrets, `.env`, geolocation traces or real student data.
- Tests: unit for audience, permission, timestamps, location/dedup; integration for tRPC auth/DB concurrency; E2E for HCO create → SR scan → KADIV manual review.
- Run generated lint/format/typecheck/test scripts; never assume a script name exists without checking `package.json`.
- Do not add Redis, microservices, queues, AI or a new module for unapproved needs.

## Agent working protocol

1. Read task-related docs; label behavior as `CONFIRMED`, `PROPOSED`, or `TBD`.
2. Implement the smallest cohesive change. If the task touches `TBD` business policy, request clarification or hide incomplete behavior behind a flag without faking correctness.
3. Add or update tests, docs and migration notes with any behavior change.
4. Describe touched paths, migration/env impacts, commands run, untested areas and open questions.
5. Do not deploy, import live users, or publish credentials without explicit approval.

## Minimum completion gate for NEED-001

See `docs/modules/need-001/prd.md` and `docs/modules/need-001/acceptance-tests.md`. Completion requires permissions, manual approval, QR replay/duplication controls, GPS fallback, and pilot UAT; merely rendering a QR or storing a scan is insufficient.
