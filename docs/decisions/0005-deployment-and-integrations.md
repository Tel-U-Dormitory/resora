# ADR-0005: Docker/VPS deployment; institutional integrations deferred

**Date:** 2026-10-10 | **Status:** Production configuration implemented; deployment pending; integrations deferred

## Decision

Retain Docker images/Compose for **web and server**, with pnpm installation, Bun 1.3.13 Express runtime and Next.js standalone Node runtime. Supabase managed PostgreSQL is the external default; Docker local PostgreSQL remains optional behind the `local-db` profile. Preserve Varlock; `DATABASE_URL` is Session Pooler, `DIRECT_DB_URL` preferred for reviewed migrations without silently switching after failure. Production configuration targets Rumahweb Ubuntu 24.04 with existing Nginx Proxy Manager on external network `resora-proxy`, domain `telkomdormitory.com`. This does not authorize deployment. University SSO and university/asrama data API integrations are **deferred**; do not make NEED-001 depend on an assumed external API. PM will privately supply the authorized SR CSV before pilot UAT; synthetic accounts until then. Gmail SMTP is planned in Phase 2, display name `RnD SR XIV`, sender address/credentials environment-only.

## Consequences / gates

**Current deployment scope (2026-10-18, Phase 2):** Supabase remains the external production database for now; PostgreSQL Docker is development-only behind `local-db`. This supersedes the 2026-10-16 planned Docker-primary direction. Manual SUPERADMIN local dump functionality remains, disabled for production Supabase. No scheduled synchronization or automatic restore/failover. No existing database/data is changed. Standalone production Compose publishes no application ports and connects only web to NPM; see [VPS runbook](../setup.md#9-rumahweb-vps-compose-production-phase-2-not-deployed). Phase 3 adds authenticated NPM client-IP metadata with a separate runtime-only shared secret, preserving Express trust proxy=false and Better Auth counters. Operator application/verification of effective-location headers and real-IP settings remains a go-live gate; see the setup client-IP runbook.

Need authorized manual/import source of truth, secure credentials, domain/TLS, reverse proxy, secret rotation, Supabase backup/restore verification (separate local-volume backup if local PostgreSQL is used), production observability and rollback. No production credentials/data committed to Git.

**Synchronization (2026-10-10):** external Supabase and pnpm/Docker configuration are implemented, while VPS deployment remains planned. No migrations/deployment are authorized by this document. [Verification limitations](../pnpm-migration.md) include the final Docker repeat blocked by host disk space.
