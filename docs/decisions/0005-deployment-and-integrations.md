# ADR-0005: Docker/VPS deployment; institutional integrations deferred

**Date:** 2026-10-10 | **Status:** Planned and Deferred (as specified)

## Decision

Scaffold Docker deployment for **both web and server** and local PostgreSQL Compose. Plan hosting on a VPS; current funding is an RAB, **not approved**. University SSO and university/asrama data API integrations are **deferred**; do not make NEED-001 depend on an assumed external API. PM will provide SR/building data for initial provisioning.

## Consequences / gates

Need authorized manual/import source of truth, secure credentials, domain/TLS, reverse proxy, secret rotation, Postgres backups and restore verification, production observability and rollback. No production credentials/data committed to Git.
