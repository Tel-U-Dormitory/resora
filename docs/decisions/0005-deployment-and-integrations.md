# ADR-0005: Docker/VPS deployment; institutional integrations deferred

**Date:** 2026-10-10 | **Status:** Planned and Deferred (as specified)

## Decision

Retain Docker images/Compose for **web and server**, with pnpm installation, Bun 1.3.13 Express runtime and Next.js standalone Node runtime. Supabase managed PostgreSQL is the external default; Docker local PostgreSQL remains optional behind the `local-db` profile. Preserve Varlock; `DATABASE_URL` is Session Pooler, `DIRECT_DB_URL` preferred for reviewed migrations without silently switching after failure. Plan hosting on a VPS; current funding is an RAB, **not approved**. University SSO and university/asrama data API integrations are **deferred**; do not make NEED-001 depend on an assumed external API. PM will privately supply the authorized SR CSV before pilot UAT; synthetic accounts until then. Gmail SMTP is planned in Phase 2, display name `RnD SR XIV`, sender address/credentials environment-only.

## Consequences / gates

Need authorized manual/import source of truth, secure credentials, domain/TLS, reverse proxy, secret rotation, Supabase backup/restore verification (separate local-volume backup if local PostgreSQL is used), production observability and rollback. No production credentials/data committed to Git.

**Synchronization (2026-10-10):** external Supabase and pnpm/Docker configuration are implemented, while VPS deployment remains planned. No migrations/deployment are authorized by this document. [Verification limitations](../pnpm-migration.md) include the final Docker repeat blocked by host disk space.
