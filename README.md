# RESORA

This existing monorepo was created with Better-T-Stack 3.44.3 (`bts.jsonc`). Phase 1 uses Supabase Development PostgreSQL through Express and Drizzle; Better Auth remains the authentication provider. No Supabase Auth or frontend database client is used. See [setup and the corrected scaffold command](docs/setup.md).

## Features

- **TypeScript** - For type safety and improved developer experience
- **Next.js** - Full-stack React framework
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Express** - Fast, unopinionated web framework
- **tRPC** - End-to-end type-safe APIs
- **Bun** - Express backend runtime
- **pnpm 10.33.4** - Workspace package manager and lockfile
- **Drizzle** - TypeScript-first ORM
- **PostgreSQL** - Database engine
- **Authentication** - Better-Auth
- **Turborepo** - Optimized monorepo build system
- **Biome** - Linting and formatting

## Getting Started

Install Node.js 24, Bun 1.3.13 and pnpm 10.33.4. With Corepack, enable the shim using `corepack enable pnpm`; Turbo requires `pnpm` on PATH. On Windows without permission to write to the Node installation directory, use `corepack enable --install-directory "$env:APPDATA\npm" pnpm` and ensure that user bin directory is on PATH. Then install the dependencies:

```bash
pnpm install --frozen-lockfile
```

Workspace packages, the shared dependency catalog, the Varlock `@next/env` override and native build-script allowlist live in `pnpm-workspace.yaml`. Commit `pnpm-lock.yaml`; do not run `bun install`. Bun remains the backend runtime and smoke-test runner.

If PowerShell blocks the Corepack `.ps1` shim, use `pnpm.cmd` without changing execution policy. See [migration verification and compatibility notes](docs/pnpm-migration.md).

## Database Setup

This project uses PostgreSQL with Drizzle ORM. Configure the ignored `apps/server/.env`:

1. Set `DATABASE_URL` to the Supabase **Session Pooler** URL (runtime).
2. Set `DIRECT_DB_URL` to the Supabase **Direct Connection** URL (migration tooling).
3. Keep the existing Better Auth/CORS values and `apps/web/.env` public API URL. Use TLS in Supabase URLs; see [setup](docs/setup.md) for details. Never put database URLs in frontend env.

Regenerate Varlock types and run the read-only connectivity checks (no auth tables required):

```bash
pnpm run env:generate
pnpm run db:check
pnpm run db:check:direct
```

`db:check:direct` never falls back to the pooler. Direct connections may require IPv6; [manual alternatives and the migration workflow](docs/setup.md#4-version-controlled-migrations) are documented. Commit generated SQL and snapshots under `packages/db/src/migrations`. `db:generate` creates migration files locally; `db:migrate` applies reviewed files and is a separate, explicitly authorized step. Do not use `db:push` against Supabase.

Then run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
pnpm dlx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@resora/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Environment Configuration

Each app owns its environment schema in `.env.schema`. Varlock generates `src/env.ts` during installation; run `pnpm run env:generate` after changing a schema. Commit schemas, and keep secrets in ignored env files or your deployment platform.

Import the generated `ENV` accessor in application code. Shared database and auth packages receive configuration or initialized clients from the application. See [Varlock's monorepo guide](https://varlock.dev/guides/monorepos/).

Bun's automatic env loading is disabled in `bunfig.toml`; the framework integration or server bootstrap loads Varlock. Node deployments must include Varlock and its dependencies alongside the app schema.

Run standalone Node/Bun tools that use Varlock from the owning app directory so they load that app's schema and env files. `env:generate` only generates TypeScript files; it does not initialize environment values in a subsequent command.

## Deployment

### Docker Compose

- Target: web + server
- Config: `docker-compose.yml` (app Dockerfiles live in `apps/*/Dockerfile`)
- Build images: pnpm run docker:build
- Start: pnpm run docker:up
- Logs: pnpm run docker:logs
- Stop: pnpm run docker:down

Compose reads the external database URL from `apps/server/.env`; it does not override it or start local PostgreSQL by default. `SERVER_URL` uses container networking and the browser API URL uses `http://localhost:3000`. BuildKit secrets supply build configuration without copying env files into image layers.

Local PostgreSQL is optional: `pnpm run db:start` / `pnpm run db:watch` explicitly select the `postgres` service in the `local-db` profile. Configure local URLs separately (host `localhost` for Bun, `postgres` for the server container), and wait for `pg_isready` before starting the apps. See [local setup](docs/setup.md#5-optional-local-postgresql).

For more details, see the guide on [Deploying with Docker Compose](https://www.better-t-stack.dev/docs/guides/docker).

## Git Hooks and Formatting

- Read-only lint/format check: `pnpm exec biome check .`
- `pnpm run check` formats/fixes files in place; it is not a read-only check.

## Project Structure

```
resora/
├── apps/
│   ├── web/         # Frontend application (Next.js)
│   └── server/      # Backend API (Express, TRPC)
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   ├── api/         # API layer / business logic
│   ├── auth/        # Authentication configuration & logic
│   ├── db/          # Drizzle schema, queries, versioned migrations
│   └── config/      # Shared TypeScript configuration
```

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:check`: Read-only runtime `SELECT 1` from the server environment
- `pnpm run db:check:direct`: Read-only `SELECT 1` using only `DIRECT_DB_URL`
- `pnpm run db:push`: Direct schema synchronization (local disposable databases only)
- `pnpm run db:generate`: Generate version-controlled migration SQL and snapshots locally
- `pnpm run db:migrate`: Preflight and apply reviewed migrations (writes; manual approval required)
- `pnpm run db:studio`: Open database studio UI
- `pnpm run lint`: Read-only Biome lint/format checks
- `pnpm run test:smoke`: Run the existing DB connectivity unit tests on Bun
- `pnpm run check`: Run Biome formatting/linting with automatic writes
- `pnpm run docker:build`: Build the Docker Compose images
- `pnpm run docker:up`: Build and start the Docker Compose stack
- `pnpm run docker:logs`: Tail logs from the Docker Compose stack
- `pnpm run docker:down`: Stop the Docker Compose stack

## Better Auth Schema Generation

After changing auth plugins or schema options, run `pnpm run auth:generate` from the project root. The script runs the Better Auth CLI through `varlock run` from the owning app directory, loading the auth instance from `src/services.ts`. Review the schema changes, then use your ORM's migration workflow to apply them.
