# ADR-0001: TypeScript/Bun modular monorepo

**Date:** 2026-10-10 | **Status:** Accepted (stack direction)

## Decision

Use Better-T-Stack with Next.js frontend, Express.js backend, Bun runtime/package manager, tRPC, TypeScript, PostgreSQL/Drizzle, Better Auth, Turborepo, and Biome; Docker for local DB and planned web/server deployment.

## Context and consequences

A small RnD team wants shared types and cohesive development while keeping backend authorization central. This avoids independently deployed microservices at the MVP stage. Next and Express are separate apps, so origins, session cookies, CORS and Docker deployment must be configured and tested. Actual package paths follow the generated scaffold.

## Explicit rejection / superseded

Laravel from older planning sheets is superseded. Do not use Prisma unless a new approved ADR changes ORM.

## Pending

VPS provider, CI, automated backups, root DNS and specific environment settings.
