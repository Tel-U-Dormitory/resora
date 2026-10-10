# RESORA — Repository Setup & Pilot Readiness

> **CONFIRMED — Phase 1:** the monorepo exists, the development scaffold works, and a Supabase Development project has been created. Application database access stays in Express via Drizzle; Better Auth is retained. Authentication policy, RBAC, NEED-001 and production rollout are later phases. No migrations are applied as part of Phase 1.

## 1. Prerequisites

- Node.js 24, Bun 1.3.13 (backend runtime), pnpm 10.33.4 (package manager), Docker Engine/Compose, Git.
- Verify `pnpm --version`, `bun --version`, `node --version`, `docker compose version`, `git --version`.
- Do not create a public repo containing real SR identity spreadsheets or credentials.

## 2. Actual scaffold and corrected command

Do not rerun scaffolding in this repository. `bts.jsonc` records Better-T-Stack **3.44.3** and the equivalent command below with the current pnpm package manager (for reference in a new, empty parent directory only). The scaffold was originally created with Bun package management; this repository has been migrated without rescaffolding:

```bash
pnpm create better-t-stack@3.44.3 resora --frontend next --backend express --runtime bun --database postgres --orm drizzle --api trpc --auth better-auth --payments none --addons turborepo biome --examples none --db-setup docker --web-deploy docker --server-deploy docker --git --package-manager pnpm --install
```

To preview a new directory creation, append `--dry-run`. Do not use `--directory-conflict overwrite` on this repository. [CLI option reference](https://www.better-t-stack.dev/docs/cli/options); future generator versions may differ. The existing Docker scaffold is retained even though Development now uses an external database.

Actual packages: `apps/web` (Next.js, port 3001), `apps/server` (Express, port 3000), `packages/api`, `packages/auth`, `packages/db`, `packages/config`, and `packages/ui`. The DB package uses `pg` with `drizzle-orm/node-postgres`, not a Supabase SDK. Better Auth schema already exists in `packages/db/src/schema/auth.ts`; Phase 1 does not change it. Shared packages receive initialized clients/configuration from Express.

Enable the pnpm shim using `corepack enable pnpm`; Turbo requires `pnpm` on PATH, even when launched through `corepack pnpm`. On Windows without permission to write to the Node installation directory, use `corepack enable --install-directory "$env:APPDATA\npm" pnpm` and ensure that directory is on PATH. Package installation uses `pnpm install --frozen-lockfile`. The root `postinstall` still generates all three Varlock schemas. `pnpm-workspace.yaml` owns `apps/*`, `packages/*`, the unchanged catalog ranges and the Next/Varlock override. Bun is retained for Express, TypeScript DB scripts and `pnpm run test:smoke`; Next.js builds/run scripts use Node.

If PowerShell blocks the `.ps1` shim, use `pnpm.cmd` instead; no execution-policy change is needed. [pnpm migration verification](pnpm-migration.md) records package-resolution, build and runtime results.

## 3. Supabase Development environment and connectivity

Keep all credentials in ignored env files. Do not print, paste into issue logs, or commit URLs/passwords. Configure `apps/server/.env` privately using Supabase Dashboard → Connect:

| Key | Purpose |
| --- | --- |
| `DATABASE_URL` | Session Pooler connection, normally port 5432; Express runtime and runtime connectivity check |
| `DIRECT_DB_URL` | Direct Connection, normally port 5432; preferred by Drizzle Kit and migration preflight |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `CORS_ORIGIN` | Existing scaffold settings; retain current development values |
| `NODE_ENV` | `development` on the workstation |

Use the exact dashboard host/username and percent-encode reserved password characters. Require TLS for external connections (`sslmode=require` at minimum; `verify-full` with the supplied root certificate verifies server identity). Do not disable certificate verification as a troubleshooting workaround. `DATABASE_URL` and `DIRECT_DB_URL` are sensitive Varlock variables; `DIRECT_DB_URL` is optional for local development. `packages/db/.env.schema` imports them from the server, so no duplicate secret file is needed. Bun's automatic dotenv loading remains disabled in `bunfig.toml`.

Keep `apps/web/.env` limited to frontend configuration, including `NEXT_PUBLIC_SERVER_URL=http://localhost:3000` (and the existing `SERVER_URL`). Never add database credentials there.

From the repository root:

```bash
pnpm run env:generate
pnpm run db:check
pnpm run db:check:direct
```

The checks run a constant `SELECT 1` through Drizzle, close their pool, and exit nonzero on failure. They do not query application data or require schema/auth tables. Output names the selected env key without printing connection URLs, driver messages or stacks. Connections have a 10-second acquisition timeout. The direct check never falls back; a nested network-unreachable failure explains the IPv6 requirement explicitly.

Supabase Direct Connection normally requires IPv6 unless an IPv4 add-on is enabled; Session Pooler is the documented alternative for IPv4-only networks. See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres). A failing direct check does not imply the runtime Session Pooler is broken.

## 4. Version-controlled migrations

`packages/db/drizzle.config.ts` selects **`DIRECT_DB_URL` when nonempty**, otherwise explicitly reports `DATABASE_URL` (for local setup). A configured but unreachable direct URL never triggers a retry with another connection. Drizzle Kit is restricted to the application `public` schema; do not manage Supabase's internal auth/storage schemas.

Generate files only, without applying SQL:

```bash
pnpm run db:generate --name=phase1_scaffold
```

Commit the complete generated migration directory under `packages/db/src/migrations` (SQL and snapshot/metadata). The installed Drizzle Kit 1.0.0-rc.4 determines the directory format; do not invent a journal layout from older versions. The Phase 1 baseline contains only the four existing scaffold Better Auth tables, not new authentication behavior or NEED-001 tables. Review every SQL file before application. [Drizzle migration workflow](https://orm.drizzle.team/docs/migrations).

**Later, with explicit approval to write to the Development project**, verify that the target is Development, check for existing tables or an existing migration history, review SQL and arrange recovery, then run `pnpm run db:migrate`. Its read-only preflight uses the same selected connection before invoking Drizzle Kit. The `db:migrate:deploy` package alias uses the same preflight. Applying the baseline over tables previously created with `db:push` may fail; do not drop tables or invent migration history to resolve that. No migration runs during dev, builds, Docker startup or Phase 1 verification. Do not use `db:push` on Supabase.

### Explicit IPv4-only migration alternative

If Direct Connection fails with `ENETUNREACH`/`EHOSTUNREACH`, DNS errors or timeout, first check IPv6 routing, firewall/VPN restrictions and project status. Prefer running migration tooling on an IPv6-capable host. Do not silently replace the direct URL.

If the team deliberately chooses Session Pooler for a reviewed Development migration, use **Session mode on port 5432**, not Transaction mode on port 6543. The explicit command below leaves the env files unchanged and does not print either URL. It loads the runtime Session Pooler URL via Varlock, passes it to the child as `DIRECT_DB_URL`, and waits for that child:

```powershell
# Read-only verification of the explicitly selected Session Pooler path:
pnpm --dir packages/db exec bun run scripts/session-pooler.ts --check
# Only after separate approval for the reviewed migration:
pnpm --dir packages/db exec bun run scripts/session-pooler.ts --migrate
```

Both commands explicitly announce the Session Pooler selection. Errors stop the command; neither changes env files or retries another connection. Production migration approval and recovery planning remain outside Phase 1.

### Windows Varlock verification workaround

During Phase 1 verification, Varlock 1.18.0 hit `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` with Node 24.13.0 on Windows. Temporarily disabling Varlock telemetry let codegen, connectivity and the web build complete. This keeps Varlock validation/loading active and does not change credential files or dependencies. In the PowerShell session used for verification:

```powershell
$env:VARLOCK_TELEMETRY_DISABLED = '1'
# Run the verification commands below in this same session.
```

Turbo passes this optional flag to child tasks. It is not forced in the project configuration. If it was previously unset, remove the session override afterward with `Remove-Item Env:VARLOCK_TELEMETRY_DISABLED`; otherwise restore its prior value.

## 5. Optional local PostgreSQL

External Supabase is the default for Compose: `docker compose config --services` lists web/server; PostgreSQL is behind the `local-db` profile. `DATABASE_URL` is taken from `apps/server/.env` without a local override, and the server has no mandatory PostgreSQL dependency.

For isolated local development:

1. Run `pnpm run db:start` (or `pnpm run db:watch`). Explicitly selecting `postgres` enables that profiled service.
2. Wait for `docker compose exec postgres pg_isready -U postgres` to succeed.
3. Privately configure `DATABASE_URL` for the local DB (`localhost:5432/resora` for Bun on the host); clear `DIRECT_DB_URL` for local-only migrations. For containerized Express use hostname `postgres` instead. Keep the database password consistent with `POSTGRES_PASSWORD`; the scaffold's default is disposable local development only.
4. Run `pnpm run db:check`. Apply reviewed local migrations only when intentionally requested.

For a fully local Compose stack, use `docker compose --profile local-db up -d --build` after the database is healthy and the server env is configured for hostname `postgres`. For external Supabase use the existing `pnpm run docker:up`. These commands start services and are manual verification steps, not Phase 1 deployment approval. Builds require the existing `apps/web/.env` and `apps/server/.env` as BuildKit secrets. The browser API URL stays `http://localhost:3000`, while server-to-server traffic uses `SERVER_URL=http://server:3000`.

## 6. Exact Phase 1 manual verification

1. Confirm privately that both DB URLs point to the Development project, with Session Pooler for runtime and Direct Connection for tooling. Do not use production URLs.
2. Run `pnpm run env:generate`, then `pnpm run db:check`; expect `DATABASE_URL: SELECT 1 succeeded.` and exit 0.
3. Run `pnpm run db:check:direct`; expect success and exit 0 on an IPv6-capable network, or a sanitized nonzero failure on an incompatible network. No pooler retry occurs. For a deliberate read-only alternative run `pnpm --dir packages/db exec bun run scripts/session-pooler.ts --check`; expect the explicit selection and `SELECT 1` success.
4. Run `pnpm exec biome check .`, `pnpm run check-types`, `bun test packages/db/src/connectivity.test.ts`, and `pnpm run build`. `pnpm run check` uses `--write` and is not suitable for read-only validation.
5. Run `docker compose config --quiet`, `docker compose config --services`, and `docker compose --profile local-db config --services`. Expect valid configuration, web/server by default, and postgres only with the profile. Avoid raw `docker compose config` output because it expands secrets.
6. Run `pnpm run dev`, open `http://localhost:3001`, and request `http://localhost:3000/`; expect the app and `OK`. The root HTTP check is process health, not database readiness. Do not exercise sign-up or write flows in Phase 1.
7. Review `git diff` and generated migration SQL/snapshots. Do not run `db:migrate`, `db:push` or authentication generation during this verification. Stop here for Phase 1 review.

### Recorded Phase 1 results (2026-10-10)

Historical results below retain the Bun commands actually executed before the pnpm migration; use the current commands above for new work.

Changed files:

- Root: `package.json`, `turbo.json`, `docker-compose.yml`, `README.md`.
- Server: `apps/server/.env.schema`, `apps/server/package.json`, `apps/server/src/scripts/check-db.ts`.
- Database: `packages/db/.env.schema`, `packages/db/drizzle.config.ts`, `packages/db/package.json`, `packages/db/src/index.ts`, `packages/db/src/connectivity.ts`, `packages/db/src/connectivity.test.ts`, `packages/db/scripts/check-migration.ts`, `packages/db/scripts/session-pooler.ts`, and the generated migration SQL/snapshot below.
- Docs: `docs/setup.md`, `docs/architecture.md`.

Varlock also regenerated the ignored `src/env.ts` files. No dependencies or secret env values were changed. Unrelated edits in `AGENTS.md` and `docs/modules/need-001/roadmap.md` were left untouched.

| Commands executed | Result |
| --- | --- |
| `bun run env:generate` | Initial sandbox access failure; approved retry hit the Windows assertion. With the temporary telemetry flag, all three schemas generated successfully. Direct Node CLI retries for server/DB also generated files but hit the assertion before the workaround. |
| `bun run db:check` | With the telemetry flag: Session Pooler `SELECT 1` passed. Initial attempts were blocked by sandbox access and then the assertion. |
| `bun run db:check:direct` | With the telemetry flag: nonzero DNS lookup failure, sanitized output, no fallback. Direct connectivity remains unverified. |
| `bun run --cwd packages/db scripts/check-migration.ts` | Same direct DNS failure; read-only preflight stopped. No migration command was invoked. |
| `bun run --cwd packages/db scripts/session-pooler.ts --check` | Explicit pooler alternative passed `SELECT 1`; no SQL applied. |
| `bun run db:generate -- --name=phase1_scaffold` | Initial Turbo interactive-task failure; package-level retry hit the assertion. After removing generation's interactive requirement and using the telemetry flag, SQL/snapshot generation passed without DB access. |
| `bun run check-types` | All six available workspace typecheck tasks passed. |
| `bun test packages/db/src/connectivity.test.ts` | Four tests passed: runtime URL isolation, migration selection, IPv6 diagnostics and secret-safe errors. |
| `bun run build` | Initial web build hit the assertion; server passed. With the telemetry flag, both web and server builds passed. |
| `bunx --no-install biome check . --max-diagnostics=10 --reporter=summary` | Failed with repository formatting/import/accessibility issues: 93 errors, 69 warnings, 2 infos at the time of the audit. No fixes applied; unrelated scaffold/UI files were not rewritten. |
| `bunx --no-install biome check packages/db/drizzle.config.ts packages/db/src/index.ts packages/db/src/connectivity.ts packages/db/src/connectivity.test.ts packages/db/scripts apps/server/src/scripts` | Final targeted source checks passed; no fixes applied. |
| `bunx --no-install biome check --formatter-enabled=false package.json apps/server/package.json packages/db/package.json turbo.json` | Passed. Existing JSON indentation is retained to keep the diff small; full formatting checks still flag it. |
| `docker compose config --quiet`, `docker compose config --services`, `docker compose --profile local-db config --services` | Passed after retrying with user-config access. Default services: server/web; profiled services: postgres/server/web. No containers were started. |
| `git diff --check` | Passed. |

Generated baseline: `packages/db/src/migrations/20261010093513_phase1_scaffold/{migration.sql,snapshot.json}`. SQL was reviewed against the four existing Better Auth tables and has not been applied. Docker image builds/container startup and browser dev smoke checks are left for manual verification; Phase 1 does not establish auth/pilot/production readiness.

## 7. Later phase: authentication bootstrapping (critical)

- Add Better Auth Username Plugin on server and client; migrate schema for `username` field.
- Set `username = NIM` for SR accounts. Numeric NIM strings remain strings to preserve leading zeros.
- Better Auth's underlying sign-up still expects `email`, `name`, `password`; PM must decide legitimate email strategy before importing real records.
- Create a privileged, **non-public** provisioning script/CLI for imports, validate unique NIM, actor SR, assigned department/building, position. Seed synthetic development-only accounts for tests.
- Cryptographically random initial passwords, safe one-time distribution, first-login reset required. Keep import evidence private, not in repo.
- Don't enable a forgot-password flow that sends to dummy/unowned email addresses.

## 8. Work sequence before 2026-10-18

| Order | Work / gate                                                         | Responsibility |
| ----- | ------------------------------------------------------------------- | -------------- |
| 1     | Existing repo, Varlock and Supabase Development connectivity (Phase 1) | RnD          |
| 2     | HCO confirms event window/QR/geofence/manual rules                  | PM + HCO       |
| 3     | Create initial department/building/SR import plan and username auth | PM + RnD       |
| 4     | Implement event + reusable QR service + attendance DB and tRPC      | RnD            |
| 5     | Implement SR flow, HCO event/recap/export, KADIV correction         | RnD            |
| 6     | Security and load tests; real mobile/GPS trial                      | QA + HCO       |
| 7     | Backup, deployment, HTTPS and UAT approval                          | DevOps + PM    |

This is a dependency sequence, **not** a fabricated daily sprint schedule.

## 9. Production gate

- [ ] No public self-registration; only authorized SR imported.
- [ ] Credentials distributed securely; forced change and recovery policy verified.
- [ ] HCO/KADIV/other SR permission matrix tested.
- [ ] Geo default, 15 min late threshold and event window policy reviewed by HCO.
- [ ] Expired QR, duplicate, GPS denial and pending/approved/rejected manual scenarios pass.
- [ ] PostgreSQL backup and restore tested; secrets rotated from defaults; HTTPS active.
- [ ] UAT signed off by PM and HCO policy owner.

Useful docs: https://www.better-t-stack.dev/docs/project-structure | https://www.better-t-stack.dev/docs/guides/docker | https://www.better-auth.com/docs/plugins/username
