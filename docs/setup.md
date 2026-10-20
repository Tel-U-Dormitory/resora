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

### Phase 2A.6 Development migration status and verified TLS

**Applied and verified, 2026-10-10:** PM confirmed `resora` Development (`unak…nbbo`). Session Pooler **5432**, database/role `postgres`, PostgreSQL **17.11** passed empty-schema/history, permissions and recovery checks. The existing explicit `--migrate` workflow applied all three unchanged Phase 1/2A migrations. Read-only checks verified ten empty application tables, username fields, constraints/indexes, three enabled deferred triggers and exactly three matching history entries; **no migrations are pending**. Backend DATABASE_URL `SELECT 1` passed. See the [complete preflight, recovery and history record](modules/need-001/resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration). Do not rerun migration DDL just to verify this status.

The configured URL has no TLS mode. Verification deliberately supplied `PGSSLMODE=verify-full`; the initial untrusted-chain error was resolved with Supabase's public Root 2021 CA via `NODE_EXTRA_CA_CERTS`, without disabling certificate verification or changing env files. Download the project CA through Dashboard → Database settings → SSL Configuration ([official instructions](https://supabase.com/docs/guides/platform/ssl-enforcement)). This phase used the public [Supabase CA download](https://supabase-downloads.s3.ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt), inspected as `Supabase Root 2021 CA`, valid until 2031, certificate thumbprint `A4518A0933AF6949482CCA3014C007C369DF9F6F`. The downloaded public certificate remains ignored at `tmp/phase2a6-prod-ca-2021.crt` on the validation workstation; acquire/verify it separately on another workstation.

To repeat **read-only** checks in a fresh PowerShell process, preserve/restore any existing values if using a shared session:

```powershell
$env:VARLOCK_TELEMETRY_DISABLED = '1'
$env:PGSSLMODE = 'verify-full'
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path -LiteralPath tmp/phase2a6-prod-ca-2021.crt).Path
pnpm.cmd --dir packages/db exec bun run scripts/session-pooler.ts --check
pnpm.cmd run db:check
# Close this dedicated process afterward, or restore the three previous values.
```

Use the same verified TLS settings for deliberate future database connections; settings here apply only to the launched process and do not establish persistent runtime/container TLS configuration. Never set `NODE_TLS_REJECT_UNAUTHORIZED=0` or `rejectUnauthorized=false`. Do not run identity integration tests against Supabase; keep RESORA_IDENTITY_TEST_DB_URL unset or pointed only at the guarded local scratch database.

### Windows Varlock verification workaround

During Phase 1 verification, Varlock 1.18.0 hit `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` with Node 24.13.0 on Windows. Temporarily disabling Varlock telemetry let codegen, connectivity and the web build complete. This keeps Varlock validation/loading active and does not change credential files or dependencies. In the PowerShell session used for verification:

```powershell
$env:VARLOCK_TELEMETRY_DISABLED = '1'
# Run the verification commands below in this same session.
```

Turbo passes this optional flag to child tasks. It is not forced in the project configuration. If it was previously unset, remove the session override afterward with `Remove-Item Env:VARLOCK_TELEMETRY_DISABLED`; otherwise restore its prior value.

## 5. Docker PostgreSQL and manual downloadable backups

Docker PostgreSQL is an optional development database, with file downloads by an authenticated active SUPERADMIN. Production uses external Supabase for now; local PostgreSQL is absent from production Compose. Scheduled backups and automatic restoration to Supabase are cancelled. No database is switched, migrated or restored during application startup. Existing environments still use their explicitly configured `DATABASE_URL` until an operator deliberately changes it.

For the isolated Docker database:

1. Store a strong generated password in ignored `.private/postgres-password` (mode 0600), or set Compose `POSTGRES_PASSWORD_FILE` to another private absolute password-file path. There is no development credential fallback. The secret is mounted only in PostgreSQL; backend credentials use the existing private server environment.
2. Run `docker compose --profile local-db up -d --wait postgres` only on the approved local development host. The existing service uses PostgreSQL 18, its own `resora_postgres_data` persistent volume, an internal network shared only with the backend, and loopback-only port `127.0.0.1:5432`. Container recreation preserves this volume; `down -v` destroys it. Never attach an existing PostgreSQL 18 data directory to PostgreSQL 17.
3. Configure the backend privately with `DATABASE_URL=postgresql://<role>:<encoded-password>@postgres:5432/resora`. Clear remote `DB_SSL_CA`/SSL URL options and clear or deliberately realign `DIRECT_DB_URL`. Provision a reviewed runtime role with application access and SELECT on all application tables/sequences for exports; bootstrap `postgres` is not the intended production runtime role. Password-file changes do not rotate credentials of an initialized database.
4. Review/apply the existing migrations only to the explicitly approved new database; no real-data transfer is included here. Run tooling inside the backend network, for example `docker compose run --rm --no-deps server bun run --cwd /app/packages/db db:migrate` with the correct private environment. Host development tools may use `localhost:5432`; containers use `postgres:5432`. Do not run `db:push` or overwrite existing data.
5. Build/start the local stack with `docker compose --profile local-db up -d --build` after schema preparation. Existing web/server env files are required as BuildKit secrets. Browser API remains `http://localhost:3000`, SSR uses `SERVER_URL=http://server:3000`. Server `/` is process liveness, not schema/database readiness; verify backend connectivity/login separately before directing users here.

### Download a backup

Set `DATABASE_BACKUP_ENABLED=true` in the backend's existing private environment and recreate the **persistent Docker backend** after selecting the Docker primary. The default is false. The Vercel entrypoint never enables exports. The backend image includes native PostgreSQL 17 clients; local development needs those clients on PATH. The source is exclusively the configured Docker `postgres:5432/resora`; remote sources and URL query overrides are rejected. Only explicitly guarded loopback `resora_identity_test_*` sources are allowed for tests. There is no Supabase credential/configuration requirement for downloading.

In **Kelola akun SR** (`/admin/users`), use **Unduh backup data**. The backend checks the authoritative session and live SUPERADMIN grant before creating the archive and again before sending it. Requests use POST, require the exact trusted Origin, and return `no-store` attachments. A database advisory lock prevents concurrent exports across backend instances; 409 means another download/export is still active, while 503 means disabled/unavailable/failed. Re-login for 401/403. Check sanitized `DATABASE_BACKUP_RESULT` server logs for outcome/duration. TRANSFERRED means the HTTP transfer completed, not proof the user saved a recoverable copy.

The `.dump` file is native PostgreSQL custom format: a consistent `pg_dump` snapshot of `public` and `drizzle`, including application rows, constraints, indexes, sequences, functions/triggers and migration metadata. It excludes other schemas, cluster roles, ownership/ACL requirements, publications and subscriptions. The server checks the archive's object scope/migration data and fully decodes it using `pg_restore` before download. Avoid concurrent migrations during export. There is no background job, upload, retention or restore endpoint.

Limits are 128 MiB compressed archive and 10 minutes for generation/validation. The browser temporarily buffers the download; large databases need a separately reviewed transfer approach. Temporary directories/files are private (0700/0600) and removed after failure, cancellation or transfer; the lock is released when the dedicated database connection closes. A process/host crash can leave private `resora-backup-*` temporary files: an operator must confirm no export is active before removing them. Use encrypted server storage and HTTPS for real data. The downloaded archive is **not encrypted** and contains password hashes, sessions and personal/GPS data: keep it in encrypted restricted storage and protect it from sharing/source control.

### Manual import into PostgreSQL or Supabase

Use native PostgreSQL 17 `pg_restore` (not CSV import or the Supabase SQL editor). Restore first into an approved **empty application schema** on PostgreSQL 17 or a separately verified newer version. Other database engines and older PostgreSQL versions are not guaranteed compatible. Use a private libpq service/password file for the target; never put passwords in command arguments. The examples below are manual operational steps, not permission to modify a remote database.

```sh
pg_restore --list /private/resora-backup.dump > /private/backup.list
# Review this list. Comment out SCHEMA entries for public and drizzle, plus
# schema comments/ACLs. Keep application object/data entries only.
# Confirm public exists and create an empty drizzle schema on the approved target.
PGSERVICE=approved_empty_target pg_restore --no-password --single-transaction --no-owner --no-acl --use-list=/private/backup.list --dbname=service=approved_empty_target /private/resora-backup.dump
```

Do not use broad `--clean`, drop managed schemas, restore over a live database, or use a data-only import with RESORA's immutable audit triggers. For Supabase, leave managed `auth`/`storage` objects intact, disable the Data API until application grants/RLS are reviewed, and use Direct/Session Pooler with verified TLS. Re-provision required runtime privileges; role passwords/ACLs are not in the archive. Verify migration history, representative records, relationships, sequence state and login against the restored database before use. Preserve the intended Better Auth secret/origins for session compatibility; a historical restore may resurrect old sessions/password state. No Supabase import has been executed or verified by this change.

`bun --no-env-file run test:backup` runs guard tests without a database. Native integration tests opt in with **both** `RESORA_BACKUP_TEST_DB_URL` and `RESORA_BACKUP_RESTORE_TEST_DB_URL`: fresh same-host/same-credential loopback databases named `resora_identity_test_*` and `resora_backup_restore_test_*`. Tests migrate/insert synthetic data only into those empty scratch databases, restore the generated archive, and check metadata/triggers/sequences, overlap and cancellation. Never point these variables at existing databases.

### Phase 2A.5 disposable identity validation

Phase 2A.5 successfully applied the three migrations only to native PostgreSQL 18.3 on `127.0.0.1:55432`, database `resora_identity_test_phase2a5`. Docker returned HTTP 500, so no Docker resources were changed. The ignored cluster at `tmp/phase2a5-postgres/data` is stopped after validation. See the [audit/results](modules/need-001/resora-need-001-data-model.md#14-phase-2a5-local-postgresql-validation). No Supabase migration is authorized by these reproduction steps.

For another host, prepare an isolated local PostgreSQL database named `resora_identity_test_*`; verify its server address/port and exact database name before any DDL. Do not substitute the application's configured database. To reuse this machine's retained scratch cluster, use the installed `pg_ctl.exe` with that exact data directory and `-o '-h 127.0.0.1 -p 55432 -c timezone=UTC'`, writing logs under the ignored scratch directory. Local trust authentication is disposable-only; keep it loopback-bound and stop it when finished.

The following read-only command verifies the retained target without passing a connection string:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/psql.exe' -X -h 127.0.0.1 -p 55432 -U resora_identity_test -d resora_identity_test_phase2a5 -v ON_ERROR_STOP=1 -c 'SELECT current_database(), inet_server_addr(), inet_server_port();'
```

Privately set `RESORA_IDENTITY_TEST_DB_URL` to the verified scratch connection. Then, from the repository root, run the existing workflow with explicit process overrides; do not edit env files or print URLs. Varlock resolved these overrides correctly during validation. The second migration invocation verifies rerun safety, and the integration suite verifies recorded names/hashes and the live catalog.

```powershell
$target = [Uri]$env:RESORA_IDENTITY_TEST_DB_URL
if ($target.Scheme -notin @('postgres', 'postgresql') -or
    $target.Host -notin @('localhost', '127.0.0.1', '[::1]') -or
    $target.AbsolutePath -cnotmatch '^/resora_identity_test_[a-z0-9_]+$' -or
    $target.Query -or $target.Fragment) { throw 'Refusing non-scratch target' }
$keys = @('DATABASE_URL', 'DIRECT_DB_URL', 'VARLOCK_TELEMETRY_DISABLED')
$saved = @{}
foreach ($key in $keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
    $env:DATABASE_URL = $env:RESORA_IDENTITY_TEST_DB_URL
    $env:DIRECT_DB_URL = $env:RESORA_IDENTITY_TEST_DB_URL
    $env:VARLOCK_TELEMETRY_DISABLED = '1'
    pnpm.cmd --dir packages/db run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Local migration failed' }
    pnpm.cmd --dir packages/db run db:migrate
    if ($LASTEXITCODE -ne 0) { throw 'Local migration rerun failed' }
    pnpm.cmd run test:identity
    if ($LASTEXITCODE -ne 0) { throw 'Local identity validation failed' }
} finally {
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
}
```

After testing, restore the previously set test URL or remove it if originally unset. Stop only the dedicated retained cluster:

```powershell
& 'C:/Program Files/PostgreSQL/18/bin/pg_ctl.exe' -D "$PWD/tmp/phase2a5-postgres/data" -w -t 20 -m fast stop
```

An unset test URL runs offline tests and skips the PostgreSQL cases; it never falls back to DATABASE_URL/DIRECT_DB_URL. Negative tests use ordinary awaited try/catch assertions to avoid a verified Bun 1.3.13 rejection-matcher stall. Scratch tests use synthetic data, roll back ordinary cases and explicitly clean the successful COMMIT fixture. Supabase application still requires separate approval, target/history/recovery review and the direct/pooler preflight described above.

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

## 7. SR authentication and provisioning

- Phase 2A enables the server Username Plugin and defines compatible username/display_username plus identity tables; Phase 2A.5 validated the full chain locally; Phase 2A.6 applied and verified it on Supabase Development through the explicit Session Pooler workflow. Phase 2B implements NIM login/logout, live active-SR checks, disabled public signup and first-password-change enforcement/UI without another migration. Phase 2C adds local synthetic CSV provisioning; real import/distribution and recovery remain pending. Review the [current migration record](modules/need-001/resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration) and [Phase 2B evidence](modules/need-001/resora-need-001-data-model.md#16-phase-2b-sr-authentication).
- Set `username = NIM` for SR accounts. Numeric NIM strings remain strings to preserve leading zeros.
- Better Auth's underlying provisioning expects `email`, `name`, `password`; every SR has a real email. Authorized CSV columns: NIM, name, email, department, position, building and active status. PM provides real data privately before pilot UAT; use synthetic accounts until then.
- Phase 2C supplies the internal `sr:provision` CLI described below; public signup stays disabled. Real imports and credential distribution still require separate PM approval.
- Cryptographically random initial passwords, safe one-time distribution, first-login password change required. Keep import evidence private, not in repo.
- Password recovery and email verification belong to Phase 2. Plan Gmail SMTP with sender display name `RnD SR XIV`; sender address and SMTP credentials remain environment variables, not documentation values.
- Review the [canonical data model](modules/need-001/resora-need-001-data-model.md) before future schema implementation; Drizzle source defines auth username fields and six identity tables; local testing passed in Phase 2A.5; Supabase Development application and read-only verification passed in Phase 2A.6. See the [migration record](modules/need-001/resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration).

### Phase 2B safe verification

`pnpm run test:auth` without `RESORA_IDENTITY_TEST_DB_URL` runs offline/guard tests and explicitly skips PostgreSQL cases. It never falls back to DATABASE_URL or loads server env files. For full verification, start the verified local scratch cluster described above and privately set that variable to its loopback `resora_identity_test_*` database with the existing three migrations. The suite checks actual server/database identity before inserting synthetic fixtures, then removes only its fixtures. **No migration command is part of Phase 2B verification.**

```powershell
$env:VARLOCK_TELEMETRY_DISABLED = '1'
pnpm.cmd run test:auth
pnpm.cmd run test:identity
pnpm.cmd run test:smoke
pnpm.cmd run check-types
pnpm.cmd run build
pnpm.cmd run lint --max-diagnostics=5 --reporter=summary
```

For UI review, use only an authorized synthetic local fixture, local Express and Next.js. Set `BETTER_AUTH_URL`/`NEXT_PUBLIC_SERVER_URL` to the same local auth origin and `CORS_ORIGIN` to the actual frontend origin; SSR `SERVER_URL`, when set, must target that same Express instance. Use localhost consistently in the browser. Keep existing Varlock and private env handling; never put passwords/URLs in screenshots or reports.

1. Open `/dashboard` without cookies: expect `/login?reason=session`. Confirm NIM is a text input and no registration link exists.
2. Submit a wrong password/unregistered NIM: generic error; submit a valid leading-zero NIM as text: authentication succeeds.
3. With `must_change_password=true`, opening `/dashboard` redirects to `/change-password`; direct protected API returns 403. Wrong/current-equal new passwords must leave the gate closed.
4. Submit current password plus a different confirmed new password: dashboard loads, NIM remains exact, old session cookies/password cannot authorize access.
5. Use the account menu's `Keluar`: session ends; revisiting `/dashboard` redirects to login. Login again using the new password.
6. Deactivate only that disposable synthetic account locally: the next API/page request is denied and shows the session state. Do not perform this mutation on Supabase as part of verification.
7. POST directly to `/api/auth/sign-up/email` with the allowed Origin: expect 403 and no new account. Six rapid login attempts from one client are throttled; missing/untrusted Origin is rejected. The integration suite automates these negative cases.

Stop the scratch cluster and remove temporary browser profiles/fixtures after review. Phase 2B tests/builds passed locally; full Biome still reports legacy scaffold failures. HTTPS/mobile, long-lived session refresh, deployment proxy configuration and real provisioning need later validation. Cookies use SameSite=Lax and Secure for HTTPS; planned frontend/backend must be same-site. In-memory throttling is per process and uses socket IP until a trusted proxy configuration is reviewed.

### Repository lint and line endings

Run `pnpm run lint` for a read-only repository check. Source/config extensions use LF via `.gitattributes` and Biome; attributes override Windows `core.autocrlf` for those files, without changing global Git settings. Do not run broad Git renormalization or format applied migration artifacts.

Biome excludes exactly the generator-owned Varlock files `apps/server/src/env.ts`, `apps/web/src/env.ts`, `packages/db/src/env.ts`, and Drizzle `packages/db/src/migrations/**/snapshot.json`. Varlock's autogenerated headers and Drizzle Kit's configured migration output identify their owners. Typecheck still consumes generated TypeScript; identity tests verify migration SQL/history. Edit generator inputs rather than generated output. SQL migrations and migration history are unchanged. Next.js's generated `next-env.d.ts` passes Biome and remains included.

Use `pnpm run test:ui` for CLI component and server-URL regression tests, alongside `check-types`, `build`, `test:auth`, `test:identity`, and `test:smoke`. Database integration suites require the guarded disposable local test database described above; never substitute Supabase.

Lint cleanup verification on `chore/lint-cleanup`: repository diagnostics decreased from **102 errors/61 warnings to zero**. Workspace typecheck and Express/Next.js production builds passed. **10 UI/URL, 16 auth, 38 identity and 4 smoke tests passed**, with no skips. Auth/identity suites reused the retained loopback scratch database, without migrations; synthetic accounts/profiles were cleaned up, migration history remained three entries and the cluster was stopped. No Supabase access, dependency upgrade, commit, push or deployment was performed. Manual visual/keyboard UAT is still a separate review gate.

### Phase 3: local organization dictionary seed

Set `RESORA_IDENTITY_TEST_DB_URL` privately to a migrated loopback `resora_identity_test_*` database. Like provisioning, this CLI loads no `.env`, never falls back to runtime/migration URLs and verifies actual server host/port/database before writes.

```powershell
pnpm.cmd run org:seed               # preview; no reference writes
pnpm.cmd run org:seed -- --apply     # explicit local insert of missing references
pnpm.cmd run test:rbac
```

The seed ensures the [canonical dictionaries](modules/need-001/resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries) (8 departments, 7 positions, 18 buildings). Rerun inserts zero rows and preserves building UUIDs/assignments. Legacy codes (including KADIV), invalid department/position assignments, mismatched names or inactive entries abort atomically with explicit conflict codes; review existing data rather than deleting or overwriting it. The old retained Phase 2A.5 scratch database has synthetic legacy references; Phase 3 uses separate `resora_identity_test_phase3_20261011`. No Supabase seed/import or new migration is authorized.

### Phase 2C: internal CSV provisioning (local synthetic imports only)

Use a disposable loopback PostgreSQL database named `resora_identity_test_*` with the three existing migrations. Set `RESORA_IDENTITY_TEST_DB_URL` privately in the process, as for the guarded integration suites. The CLI checks both the URL and actual server host/database/port before account writes. It ignores `DATABASE_URL`/`DIRECT_DB_URL`, loads no `.env` files, and rejects remote targets. No migrations are part of provisioning. An authorized real-environment rollout is a later approval gate, not a current CLI option.

UTF-8 input (optional BOM, RFC CSV quoting, maximum 5 MiB/5,000 accounts):

```csv
nim,name,email,department,position,building,is_active
000260000001,Synthetic SR,synthetic-sr@example.invalid,HCO,ANGGOTA,A,true
```

Use the [canonical 8/7/18 organization codes](modules/need-001/resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries), including KADEP instead of legacy KADIV and separate buildings A–F / 1–12. INTI accepts only KETUM/WAKETUM/SEKRETARIS/BENDAHARA; other departments accept KADEP/SEKDEP/ANGGOTA. These organization **codes** must already exist and be active in the local dictionaries; the importer never creates or changes organization records. Header order may vary, but all seven columns are mandatory, with no extra columns. NIM stays a string using the configured Username Plugin validation. Email is normalized to lowercase; `is_active` accepts `true`, `false`, `1`, `0`. Do not open/save the roster through spreadsheet number coercion; import NIM as text. Use only synthetic names/emails in this phase.

```powershell
# Run from repository root; privately set RESORA_IDENTITY_TEST_DB_URL first.
pnpm.cmd run sr:provision -- --input .\tmp\synthetic-sr.csv --dry-run
pnpm.cmd run sr:provision -- --input .\tmp\synthetic-sr.csv --apply
pnpm.cmd run test:provision
```

Dry-run is the default: read-only transaction, no hashing/account writes/credential export. Apply validates the whole batch, serializes concurrent imports, and uses transaction-bound Better Auth internal user/account creation and its configured password hasher. Each new SR receives its organizational profile, imported active status and `must_change_password=true`; no superadmin privilege is granted. Initial passwords are exactly eight random alphanumeric characters (A–Z, a–z, 0–9), generated with cryptographic randomInt and unique within the batch. Better Auth internal hashing/username login accepts these initial credentials; the unchanged permanent-password policy still requires at least eight characters when changing passwords. Identical existing identities are skipped (including after password change), with no password reset or old password export. Any differing identity/organization/active status or conflicting NIM/email rejects the entire batch; this is not an account-update tool.

Each apply that creates accounts writes **one** `credentials.csv` under `.private/sr-provisioning/<random-run-id>/`, with `nim,name,email,temporary_password`. The `.private` directory is Git-ignored (verified before export) and excluded from Biome traversal; it contains private operational data, not source. New directories are owner-only on POSIX (700/files 600), or restricted to the current Windows user and SYSTEM; existing insecure directories are rejected. Output never replaces the input or a previous export. Console output contains counts/path only; do not paste credentials into logs, tickets or Git. Read the CSV as text, not as executable spreadsheet formulas.

The adjacent `status.json` records count, CSV SHA-256 and `PREPARED`, `COMMITTED`, `FAILED` or `UNCONFIRMED`, without passwords. The complete credential file is exclusively created and fsynced **before** account inserts and DB commit. Output failure rolls back all accounts. Constraint/insert failure also rolls back the whole batch and retains a `FAILED` export; do not distribute it. Only `COMMITTED` is ready for private handoff. If a process stops after preparing output or commit confirmation/metadata fails, keep the private CSV and treat `PREPARED`/`UNCONFIRMED` as requiring a read-only account/profile comparison before any handoff. Do not delete/reset accounts, regenerate passwords or edit migration history to resolve uncertainty. Retry skips exact existing accounts; never recreates their credentials. Windows uses file fsync/NTFS; directory fsync is used where supported. Database/filesystem commit is not a single atomic resource transaction, so retain this recovery evidence.

`test:provision` creates one principal synthetic dummy through the actual CLI, exercises login → mandatory password change → protected dashboard API, and uses temporary additional fixtures for failure/bulk/concurrency cases. All database fixtures are removed afterwards; private credential exports remain ignored for review. Tests never log passwords and require the local scratch target; without it PostgreSQL cases explicitly skip. Existing auth/identity regression suites remain required. SMTP/recovery, real roster import and operational distribution are not implemented here.

After `pnpm run build`, optional CLI-only production-page verification starts an isolated Next.js process targeting that suite's local Express instance and checks anonymous redirect, first-password-change redirect and successful dashboard HTTP response:

```powershell
$env:RESORA_PROVISION_WEB_SMOKE = '1'
pnpm.cmd exec bun test packages/api/src/modules/identity/sr-provisioning.integration.test.ts --test-name-pattern 'dry-run|one dummy'
Remove-Item Env:RESORA_PROVISION_WEB_SMOKE
```

## 8. Vercel deployment preparation (Phase 8A; not deployed)

Historical/optional preparation. The current production target is the Rumahweb VPS
configuration in section 9; the Vercel-specific settings below do not apply to VPS Compose.

Current target: two Vercel Projects from this repository, `resora-web` (Root Directory `apps/web`, Next.js) and `resora-api` (Root Directory `apps/server`, Express). Enable **Include source files outside of the Root Directory in the Build Step** for both projects so pnpm workspace packages are available. Select Node.js **24.x**; each app pins that major in `engines`. Repository `vercel.json` files select the framework, `pnpm install --frozen-lockfile` and `pnpm run build`. Leave Output Directory at the framework default; do not set API output to `dist`. The native Express builder discovers `apps/server/app.mjs`, which imports generated `./dist/app.mjs` with an explicit ESM path and exports `createApp()` without opening a listener. `src/vercel-app.ts` is the bundle source; root bridge is not a tsdown input. Function packaging explicitly includes `dist/**` and `.env.schema`; the bridge sets the API working directory before Varlock loads. The existing Bun `src/index.ts`/`dist/index.mjs` listener and Dockerfiles remain available. No adapter or Vercel SDK is added to domain code. See [native Express](https://vercel.com/docs/frameworks/backend/express), [monorepos](https://vercel.com/docs/monorepos) and [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

### Environment mapping (PM supplies values privately)

| Project / scope | Variable | Mapping / requirement |
| --- | --- | --- |
| API runtime | `DATABASE_URL` | Explicitly copy the verified target's Transaction Pooler URL (Production candidate: private `PROD_TX_POOLER_URL`). No automatic Production selection. |
| API runtime | `DB_POOL_MAX`, `DB_POOL_IDLE_TIMEOUT_MS` | Initially `1`, `1000` per warm instance. Persistent defaults remain `10`, `10000`. |
| API runtime | `DB_SSL_CA` | Verified Supabase public root certificate PEM, entered privately; TLS and hostname verification stay enabled. With this setting the runtime URL must contain no SSL parameters that could override it. |
| API runtime | `BETTER_AUTH_SECRET` | Unique environment-specific secret; never a frontend/build constant. |
| API runtime | `BETTER_AUTH_URL`, `CORS_ORIGIN` | Both equal the exact HTTPS **web** origin, not the API hostname. Keep the origin stable; no wildcard preview origins. |
| Web build + runtime | `NEXT_PUBLIC_SERVER_URL` | `/`: browser auth/tRPC resolve against the current web origin. This contains no secret. |
| Web build + runtime | `API_UPSTREAM_URL`, `SERVER_URL` | Exact API HTTPS origin, without credentials/path/query. First configures rewrites, second SSR requests. Server-only, non-secret; upstream routing is visible in routing manifests. |
| Both | `NODE_ENV`, `VARLOCK_TELEMETRY_DISABLED` | Production runtime; disable Varlock telemetry if required by the environment. Varlock codegen remains in root postinstall. |
| Separate authorized migration workstation only | `DIRECT_DB_URL` | Private `PROD_DIRECT_DB_URL`, only after separate migration approval. Do not put it or the `PROD_*` keys in either Vercel runtime. `PROD_DB_URL` has no assumed mode or automatic use. |

Never give Web any database URL, auth secret, credential export or migration credentials. API Varlock uses its supported in-process loader and packages `.env.schema`, retaining redaction without relying on a runtime CLI subprocess. Vercel runtime secrets are loaded at cold start, not embedded in compiled server code. If root postinstall asks for API build validation variables on Web, use only the CI's explicitly nonfunctional synthetic API values for that install step; do not inject Production secrets to satisfy codegen.

Browser topology: `web /api/auth/*` → API `/api/auth/*`; `web /trpc/*` → API `/trpc/*`; other paths remain Next.js. Rewrites proxy requests without changing browser origin; SSR calls `SERVER_URL` directly and forwards only the session cookie. Better Auth uses host-only HttpOnly/SameSite=Lax/Secure cookies for the web HTTPS origin; do not enable cross-subdomain cookies. Origin checks, CORS and private API no-store are unchanged. See [Next.js external rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites).

### Database compatibility and release gates

The pg client remains module-scoped. Application queries use unnamed pg statements; no `.prepare()`/named prepared statements or session-persistent SQL is used by runtime Attendance/Identity. Drizzle transactions reserve a client for their BEGIN/COMMIT and row locks, compatible in principle with Transaction Pooler. Provisioning uses transaction-local advisory locks but is not a Vercel route. Pool tuning is explicit, with no driver replacement. Transaction Pooler compatibility, TLS handshake, cold/warm reconnection and concurrency still require separately approved **Development** validation; no Production connection was made for Phase 8A. Idle eviction reduces retained connections but cannot prove behavior during function suspension. See [Supabase connection modes/limitations](https://supabase.com/docs/guides/database/connecting-to-postgres).

**Phase 8B update:** PM selected Better Auth native database storage. Production now uses shared PostgreSQL counters; local/test retains memory. Migration `20261013024827_phase8b_auth_rate_limit` adds only `rate_limit` (text id PK, unique key, integer count, bigint millisecond last_request and expiry/pruning index). It is **unapplied everywhere**. Missing table/storage errors fail closed as a generic Express 503, never downgrade to memory. Installed 1.7.7 and its Drizzle relations-v2 adapter use unique-key insertion and conditional atomic increment; no custom limiter/Redis or change to the five-per-60-second login/change-password rules. Schema generation must include database limiter mode and be reviewed; generating auth schema in local memory mode alone would omit this model. Limiter keys contain IP/path metadata; do not log/export them. Better Auth handles expired counter pruning; do not infer an approved long-term security-log retention policy from this.

**Production still blocked on evidence:** Express ignores supplied forwarding headers and uses socket IP; Web → API routing may group users under proxy addresses. [Vercel headers](https://vercel.com/docs/headers/request-headers) document edge overwrite behavior but do not establish original browser IP across both projects. No unrestricted proxy/header trust was introduced. Real PostgreSQL concurrency, reviewed migration application and Preview IP/routing/TLS proof remain gates. Future home-server/VPS deployments need their own explicit proxy boundary review.

After code review **and separate deployment authorization**, PM should:

1. Resolve the limiter/IP gate; choose a matching isolated API/Web environment and exact web origin. Preview environments must not point to Production; arbitrary preview hosts will fail strict Origin checks by design.
2. Import the repository as the API Project using the settings above; add only its required private environment mapping. Configure any deployment protection deliberately so authorized Web rewrites/SSR can reach API (do not blindly disable protection). Deploy API first, then verify native entrypoint, Varlock/schema packaging, TLS/pool and origin rejection.
3. Import Web as the second Project; set its three routing variables and the agreed web hostname. Deploy Web, then verify same-origin POST login/change-password/logout, Set-Cookie preservation, SSR cookie forwarding, protected redirects, no-store headers and forged-Origin rejection. External rewrites and runtime packaging still need actual Vercel evidence.
4. Perform HTTPS mobile scanner/GPS UAT and resolve GPS/export retention, backup/recovery and remaining live-profile gates before pilot/Production. Deployment rollback does not roll back PostgreSQL writes/migrations; migrations always require a separate reviewed runbook/approval.

Local Windows keeps existing absolute localhost URLs and no `API_UPSTREAM_URL`; Docker keeps its existing browser URL and internal `SERVER_URL`. Home server/VPS can use the Bun listener behind a configured HTTPS proxy with the same environment contract and Supabase provider. No domain/service rewrite is required.

**Phase 8A local evidence:** 111 offline tests passed, six workspace typecheck tasks passed, Web/server builds passed using nonfunctional synthetic DB values. Final pool error-redaction tests (3) and DB typecheck passed; read-only Biome checked 160 files without errors/warnings. The built Express entrypoint passed loopback health/anonymous SSR/origin/signup/header checks on Node 24.13.0 and Bun 1.3.13. Vercel CLI/platform packaging, rewritten cookies on the actual platform, real Transaction Pooler and Docker image execution are not verified by these checks. No remote DB connection, migration or deployment occurred.

## 9. Work sequence before 2026-10-18

### Phase 8B Production security readiness / Preview gate

No deployment or migration is authorized by this checklist. PM must separately approve an isolated Preview/Development target, migration and test traffic. Never map Preview to Production. Existing local test command, after the migration has been separately reviewed/applied to an isolated loopback `resora_identity_test_*` database:

```powershell
# Set RESORA_IDENTITY_TEST_DB_URL privately; the suite has no remote/default fallback.
pnpm.cmd exec bun --no-env-file test packages/auth/src/rate-limit.integration.test.ts
```

This suite uses the real adapter with two independent auth contexts and concurrent PostgreSQL connections, validates the actual host/name/port, never creates schema/accounts, and removes only its synthetic limiter keys. It is skipped without an explicit local test URL. Offline adapter doubles are not live PostgreSQL proof.

PM Preview checklist (record only statuses/counts/booleans, never credentials, cookies, real IPs or rate-limit keys):

1. **Startup/schema:** API health returns 200; verify cold-start Varlock/schema packaging and runtime Node 24. Read-only DB catalog/history shows the separately approved limiter migration/table/unique key/index. Check one anonymous get-session request; missing limiter schema must produce generic 503 with no-store, not fallback to memory.
2. **Routing/cookies/SSR:** Web Network requests stay on its origin for `/api/auth/*` and `/trpc/*`; approved synthetic login/change-password/logout work. Inspect cookie flags/host/path locally without copying values. Refresh protected pages to verify SSR session forwarding and password-change gate. Verify no-store on proxied responses.
3. **Origins:** direct POSTs with absent/foreign/`null` Origin are rejected; only the exact configured HTTPS Web Origin works. Confirm CORS does not grant another origin and public signup stays rejected. Do not add wildcard Preview trust.
4. **Spoof resistance:** after the limiter window is clear, send six empty-body login POSTs from one client while changing synthetic `x-resora-client-ip`, `x-forwarded-for`, `x-vercel-forwarded-for` and `x-real-ip` values. Log status numbers only. They must not reset its bucket; expected five validation rejections then 429. Repeat through Web rewrites and directly against API using the configured Origin. CORS header permission is not proof of trusted IP handling.
5. **Original IP vs NAT:** use two devices on genuinely different networks after clearing the window, then two devices sharing one NAT. Different networks should have independent per-client buckets; NAT users intentionally share five requests per 60 seconds per path, including invalid attempts. If different networks share the proxy bucket, STOP the Production release. This behavioral test alone does not prove exact original IP; require a restricted, short-lived diagnostic comparison returning only `selected_source` and match/spoof booleans (no raw IP/cookie/credential logs). No such remote diagnostic endpoint is shipped here. `x-vercel-id` is not a Function-instance or original-IP proof.
6. **Shared instances/concurrency:** prove counters survive an API process restart/cold instance and parallel requests. For two independently observable API instances/deployments on the same approved isolated DB and verified same client bucket, five combined requests pass validation and further attempts return 429; twenty parallel requests admit at most five. Repeat for change-password. Do not claim cross-instance proof from several requests to an unidentified single warm instance. Read only aggregate counts, never raw keys.
7. **Pooler/TLS:** privately confirm DATABASE_URL is the approved Transaction Pooler, pool max 1/idle tuning and verified project CA. Test a real authenticated session and transactional Attendance operation using only approved fixtures; inspect cold/warm behavior and bounded connections. Failed certificate validation must fail, not select another connection or disable verification.
8. **Release decision:** record PASS/PARTIAL/FAIL for each gate. Current original-IP behavior is deliberately socket-only and cannot be signed off without actual platform evidence. Alternatives requiring PM review: a single controlled ingress with narrowly verified forwarding, or an authenticated Web→API IP relay that strips all untrusted claims and prevents bypass. Do not trust Vercel-style headers solely because a request includes them. Mobile HTTPS/GPS, real-data privacy/retention and other pilot gates remain open.

Docker context now excludes `.private`, account/credential CSV files, pgpass files, tmp/temp and env value files. No tracked CSV assets are required by current builds. Keep future public CSV assets explicit rather than broadly unignoring imports. Web standalone output recursively removes env values before runner COPY, preserving only schema/example templates; both Dockerfiles retain BuildKit secret mounts and existing Node/Bun entrypoints. Docker daemon/image-layer verification is a separate pending check when Docker is available.

**Phase 8B local evidence:** 120 offline tests passed; guarded limiter integration reports 1 guard PASS and 4 SKIP (two PostgreSQL scenarios and lifecycle hooks), because no isolated test URL is configured and the known retained scratch cluster is stopped. Six workspace typecheck tasks, Web/server builds, read-only Biome (163 files), diff check and Compose configuration validation passed. Built Node/Bun loopback smoke verified the real unreachable-DB limiter path returns sanitized 503, with no memory fallback. Snapshot comparison preserved all previous DDL; all six applied migration files remain unchanged. Docker daemon is unavailable; no image was built/inspected. No schema migration was applied and no remote database was connected or mutated.

### Authentication reliability diagnostics

API-only `AUTH_RATE_LIMIT_ENABLED` defaults to `true`. Only lowercase `true`/`false` are accepted by the Varlock string enum; invalid/empty values stop configuration loading. `false` deliberately disables Better Auth throttling for a bounded diagnostic window; it never selects memory fallback. With `true`, login/change-password each allow 75 requests per IP/path per 60 seconds (the 76th returns 429), with database-backed shared storage in Production. Change the API deployment environment and redeploy for each switch; there is no UI/runtime toggle. Turbo passes the flag through; Docker continues to read the existing server env file. Authentication, Origin checks, active identity/grant reads and mandatory password change are unchanged.

`AUTH_REQUEST_RESULT` retains LOGIN/PASSWORD_CHANGE results and adds failure-only AUTH_SESSION (`/api/auth/get-session`), IDENTITY_SESSION (`/trpc/identity.session`) and TRPC (other/batched tRPC) diagnostics. Session/tRPC records are emitted only for actual HTTP 5xx, including context-creation failures: fixed operation, status, UNAVAILABLE (503) or ERROR (other 5xx), durationMs and numeric poolTotal/poolIdle/poolWaiting snapshots. No IP, key, request body, URL/query input, cookie, session or raw exception is logged. HTTP 429 means RATE_LIMITED for login/password actions (retry header preserved); internal returned/thrown auth errors become sanitized 503 AUTH_UNAVAILABLE; successful actions retain their response/cookies. A pool snapshot is point-in-time evidence, not a historical queue trace.

The [current password policy](modules/need-001/prd.md) derives `requiresPasswordChange` from live identity/grants: only SYSTEM_ADMIN and explicitly privileged SR are blocked while the stored flag is true. Regular SR may use initial credentials and voluntarily rotate through Profile. Stored flags, provisioning defaults, rate-limiter settings and successful rotation/session-revocation behavior remain unchanged.

The installed pg-pool emits `timeout exceeded when trying to connect` when a checkout waiter exceeds the configured 10 seconds. Runtime pool remains module-scoped, recommended max 1/idle 1000 ms on Vercel; no timeout/pool-size increase. The duplicated `/get-session` lookup is removed: Better Auth reads its authoritative session once, then the after-hook revalidates current identity. No identity/session cache is introduced; tRPC/transaction authorization reads remain. Login `fetchQuery()` already defaults to no retries, so no frontend retry change is necessary. Pool occupancy/slow queries, function concurrency/cold starts, network/pooler latency and resource pressure still need incident-time measurements; low database CPU and high memory commitment alone do not establish cause.

For a separately approved A/B test, first use an isolated Preview/Development target and approved synthetic users. Keep pool/TLS/region/request mix/concurrency fixed. A: deploy `true`, wait at least one full 60-second limiter window, then record only status counts and latency with modest bounded concurrency. B: redeploy the same API code with `false` and repeat. Compare 429 vs 503 separately; removing 429 alone does not fix pool saturation. Stop on elevated 503/error rates, avoid automatic credential retries, and restore `true` with a new API deployment immediately after the window. Any Production test/deployment requires separate authorization; do not reset limiter rows, identities or database schema.

Client IP selection uses a single IPv4/IPv6 from `x-vercel-forwarded-for` only when the process platform flag `VERCEL=1` identifies genuine Vercel ingress. [Vercel request headers](https://vercel.com/docs/headers/request-headers) documents ingress overwriting for spoof protection. Local/Docker must not set that platform flag: they use the socket IP and ignore forwarded headers. Missing, malformed, list or repeated-header values use the fixed `127.0.0.1` limiter bucket; no alternative request header is trusted. Express always overwrites `x-resora-client-ip` and keeps `trust proxy=false`. The flag is not proof of ingress on an arbitrary self-hosted server. Original visitor preservation across the actual two-project rewrite remains a Preview release gate: compare known client IPs in memory (emit only match/spoof booleans), test direct API and Web-to-API paths from two networks plus same-NAT clients, and inject forged forwarding/RESORA headers to confirm Vercel overwrites them. Do not log raw IPs or ship a public diagnostic endpoint. If the path exposes only proxy egress, review controlled ingress separately rather than trusting arbitrary headers. Same-public-IP users intentionally share each 75/60 bucket; login and password change buckets are independent.

### Selective Nafi UI integration — 2026-10-11

On `integration/nafi-style`, `main` (`7462d53`) remains the authority for Phase 2B auth, sessions, active-account/password gates and protected pages. Selected Nafi Button/Card/Avatar/Skeleton components, brand tokens and presentational navigation stay in `apps/web`; shared packages and backend are unchanged. Existing login/password/logout handlers are preserved. Providers, auth client, SSR session helper, home behavior, package manifests and lockfile use `main`; no extra dependency is needed. Mock profiles/auth context, role simulator, localStorage permissions, unimplemented attendance navigation and unused QR/Iconsax dependencies are excluded. Dark-mode/shared UI tokens and accessible avatar/focus states are retained.

CLI regression passed: **16 auth tests, 38 identity tests, 4 smoke tests**, zero failures/skips, using only the verified local scratch database. Typecheck passed six tasks; Express/Next.js builds passed, including all three protected/auth routes. Ten frontend callbacks match `main` after ignoring formatting; backend/auth/protected-page source comparisons match. All 15 selected/edited frontend source files passed read-only Biome. Full repo lint still fails (**87 errors, 61 warnings**) in preserved main/scaffold formatting and existing lint issues; unrelated code was not reformatted. Local fixtures were removed, ten tables remain empty, history remains three entries and the scratch cluster was stopped. No browser automation, Supabase connection/mutation, migration, push or merge into `main` was performed. Visual/mobile UAT remains a separate review gate; the integration merge is left uncommitted for review.

| Order | Work / gate                                                         | Responsibility |
| ----- | ------------------------------------------------------------------- | -------------- |
| 1     | Existing repo, Varlock and Supabase Development connectivity (Phase 1) | RnD          |
| 2     | Review remaining closure/override bounds; field-test GPS limits                  | PM + HCO       |
| 3     | Create initial department/building/SR import plan and username auth | PM + RnD       |
| 4     | Implement event + reusable QR service + attendance DB and tRPC      | RnD            |
| 5     | Implement SR flow, HCO event/recap/export, KADEP correction         | RnD            |
| 6     | Security and load tests; real mobile/GPS trial                      | QA + HCO       |
| 7     | Backup, deployment, HTTPS and UAT approval                          | DevOps + PM    |

This is a dependency sequence, **not** a fabricated daily sprint schedule.

## 9. Production gate

- [ ] No public self-registration; only authorized SR imported.
- [ ] Credentials distributed securely; forced change and recovery policy verified.
- [ ] HCO/KADEP/other SR permission matrix tested.
- [ ] Map-selected center, 20 m radius, 15 min inclusive tolerance and configurable static six-hour QR lifetime verified; scan allowed before/after schedule while QR active.
- [ ] Expired/revoked QR, duplicate, inactive account and GPS denial cases pass; KADEP HCO manual insert/correction, effective/recorded time and immutable audit verified.
- [ ] Publication snapshots and exports include all invited non-attendees; pending becomes absent on explicit authorized HCO closure, which invalidates the active QR.
- [ ] PostgreSQL backup and restore tested; secrets rotated from defaults; HTTPS active.
- [ ] UAT signed off by PM and HCO policy owner.

Useful docs: https://www.better-t-stack.dev/docs/project-structure | https://www.better-t-stack.dev/docs/guides/docker | https://www.better-auth.com/docs/plugins/username

### Phase 4: internal events/session/QR local review

New migration: `packages/db/src/migrations/20261011135412_phase4_attendance/` (SQL + generated snapshot); applied only to disposable `resora_identity_test_phase4_20261011` on local PostgreSQL 18.3, loopback port 55432. Four migration history entries matched versioned hashes and rerun applied nothing. Existing three applied identity migrations remain unchanged. No Supabase migration/seed occurred.

For another explicitly selected scratch database, first verify loopback hostname/database `resora_identity_test_*` and initialize the entire versioned chain via the existing Drizzle migrator. Never silently substitute DATABASE_URL. Set RESORA_IDENTITY_TEST_DB_URL privately, then `pnpm.cmd run org:seed` (preview), `pnpm.cmd run org:seed -- --apply`, and `pnpm.cmd run test:attendance`. The guarded seed adds INTI without updating old assignments; invalid legacy data aborts visibly. Regression commands remain `test:identity`, `test:auth`, `test:rbac`, `test:provision`, `test:smoke`.

HCO uses `/events` to create/edit a draft, select roster, preview, publish, explicitly activate session, display/revoke/reissue QR and close event. Non-HCO sees published invited events only. Publish freezes schedule/roster/session configuration; it does not activate QR. Signing derives a domain-separated key from existing backend Better Auth secret; no new frontend secret/env or auth configuration. Secret rotation invalidates previously signed challenges. QR validity is not check-in: scanner, GPS validation, records/audit/export remain future phases. Remote migration needs separate target preflight and PM approval; manual UI UAT remains required.

**Phase 7 quality checks:** root `tmp/` and `temp/` are Git-ignored one-off test/report artifacts, specifically excluded from Biome; source rules and generated-file exclusions remain enforced. `pnpm run test:offline` selects DB-free regression tests plus loopback HTTP with auth/DB doubles. CI uses synthetic nonfunctional env values, Varlock postinstall, Next route typegen, Biome/typecheck/build; it never migrates/seeds/provisions or requires Supabase credentials. Phase 6 Development now has six applied migrations and 17 PostgreSQL test groups passed, including five concurrency cases; see the canonical model/roadmap for the remaining live-profile and Phase 8 UAT gates.

## Administrator lifecycle rollout (2026-10-19)

The initial local implementation adds two reviewed migrations: `20261019020318_admin_password_reset` (reset flag/audit action) and `20261019020540_sr_tenure_periods` (two tenure tables and audit details/actions). Apply only through the existing reviewed migration process. This work does not authorize a remote migration, roster import or deployment.

Before rollout, arrange an active dedicated SYSTEM_ADMIN and an approved mapping of every currently serving SR to a period. Unassigned SR will be denied login; no migration guesses legacy tenure dates. Deploy period management and enforcement together during a controlled window, then have the administrator create approved periods and assign the roster. New-account UI requires a period; CSV/API-created unassigned SR require explicit assignment before login. Do not mark migration success as roster readiness. Database restore environments also need the full migration chain before starting the new application.

On `/admin/users`, create a period under **Kelola periode menjabat**, choose members (selection can span pages; maximum 200 per assignment), select the destination period and assign. For returning SR, assign the next period to the existing account. **Perpanjang seluruh periode** affects all its members; use a new membership when only selected SR continue. Start/end dates use WIB and the end date includes the full final calendar day. A gap between periods denies access. Renewing tenure never clears manual inactivity. The **Diarsipkan / Purna** status retains identity, event snapshots, attendance and audit; no delete or scheduled job is required.

Use **Reset password** and its confirmation to issue a temporary credential, privately hand it to the owner, and close the one-time display. Other sessions are revoked and the owner must change the password after login. A lost response leaves the result uncertain: perform a new explicit reset if a usable credential is needed. Cached directory data is memory-only and can be refreshed with **Perbarui data**; logout/login/reload clears it.

Offline additions can be checked with `bun --no-env-file test apps/web/src/features/identity/account-status.test.ts packages/api/src/modules/identity/account-lifecycle.integration.test.ts` (database cases skip without opt-in). For the database suite, set only `RESORA_ADMIN_LIFECYCLE_TEST_DB_URL` to an **empty** PostgreSQL database named exactly `resora_identity_test_admin_lifecycle` on `127.0.0.1`, without URL options, then run the lifecycle integration file. It refuses existing public tables, applies the complete migration chain and writes synthetic fixtures. Never substitute the application's DATABASE_URL. The test database/container can be disposed of after the suite. CLI verification does not replace browser/manual UAT for search, selection, one-time credential display and the purna notification.

### Local verification evidence (2026-10-19, not released)

- `bun --no-env-file run test:offline`: **271 passed**, including HTTP authorization and cached-date state tests.
- Lifecycle integration file with the explicit scratch opt-in: **10 passed / 72 assertions** against a fresh disposable PostgreSQL 17 container. The complete migration chain applied successfully. Cases cover period creation/extension/renewal, idempotent concurrent assignment, date boundaries, unassigned/future denial, expiry notification only after valid credentials, old-session denial, SR SUPERADMIN expiry, dedicated-admin exemption, snapshot retention, real password hashing/session revocation, concurrent reset versus public rotation, persisted production limiter counters, and rollback after replacement-session failure. Only synthetic users were used.
- Direct installed `tsc --noEmit -p ...` checks for DB, auth, API, server and web passed. Installed Biome repository check passed. Web `next build` and server `tsdown` builds passed. The pnpm shim attempted an unavailable local store check; verification used installed binaries without dependency installation or lockfile changes.
- Historical regression suites were updated to explicitly assign synthetic tenure: authentication/RBAC/attendance **28 passed**, event administration **10 passed**, and dedicated administrator/bootstrap **12 passed** on separate guarded PostgreSQL databases. Bootstrap exports used an isolated ignored temporary fixture root with its own private permissions, leaving the existing user `.private` directory untouched. Migration counts follow the actual versioned chain rather than a historical fixed count; the session DTO assertion follows the current public contract.
- No browser automation, visual testing or manual UAT was performed. CSV provisioning's optional full export/CLI suite and other opt-in suites were not rerun; its tenure fixture updates were typechecked. No remote database/schema/data, real-user credentials or deployment was changed. Prepared migrations and the new behavior remain unreleased until reviewed rollout and roster mapping. Disposable database containers and synthetic bootstrap credential directories were removed after verification.

### Staging migration preparation (2026-10-19)

The user explicitly authorized migration of the currently configured remote staging database. Read-only preflight matched the existing eleven migration hashes to the repository and found the two lifecycle migrations pending. Staging also grants new public tables to `anon`/`authenticated` by default. Additive migration `20261019030747_sr_tenure_server_only` enables RLS on the two tenure tables and revokes all table privileges from PUBLIC and existing client roles, including TRUNCATE privileges which RLS alone does not protect. It does not change default privileges or other tables. Runtime's configured database role bypasses RLS; Better Auth/Express continues enforcing application access. No client policies are introduced.

All three pending migrations must be applied in the same migration transaction, preventing an intermediate committed state with exposed tenure tables. Failure rolls back the lifecycle DDL/history together. Existing user identities, manual-active flags, credentials and period assignments must not be changed by this operation. Application rollback can use the prior code while retaining the additive schema; do not drop populated tenure tables as an automatic rollback. Production remains outside this staging authorization.

### Staging application result (2026-10-19)

After the user's explicit staging authorization, the three pending migrations above were applied and committed through the native Drizzle migration runner. All **14** remote migration hashes match the repository. Migration transport used the official public Supabase Root 2021 CA with certificate and hostname verification; no credential/env file was edited. The initially configured runtime connection has no TLS, so the first mutation attempt stopped at the TLS guard **before any DDL**. Verified TLS was supplied only to the subsequent migration/postcheck process. Persistently enabling runtime TLS remains a separate configuration step.

Read-only postchecks confirmed the reset flag, audit details, both tenure tables, enabled RLS, and zero SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER privileges for the client API roles on the tenure tables. The local anonymous auth-session endpoint returned HTTP 200/null. The additional isolated PostgreSQL suite, with staging-like client default grants, passed **11 tests / 75 assertions** before remote application. No existing credential, manual-active flag or membership was changed; both new tables are empty.

**Administrator readiness is blocked:** the configured staging database has neither a dedicated SYSTEM_ADMIN nor an existing SUPERADMIN grant. A read-only lookup also did not find the login username supplied in the user's screenshot. Thus the schema-related 503 is addressed, but a successful administrator password login is not yet verified and cannot be claimed. The next authorized step is to bootstrap a dedicated administrator using a user-approved username/name/email, then assign approved periods to existing SR. User confirmation/identity details are pending; do not invent them or bulk-assign periods. Production was not accessed and no branch was pushed.

### Staging administrator bootstrap result (2026-10-19)

The user subsequently explicitly authorized creation of a dedicated staging administrator and supplied its identity and initial credential. The previous administrator-readiness blocker is resolved. A one-off in-memory administrative operation reused the existing remote target/TLS/migration-history guard, bootstrap advisory lock, identity validation, Better Auth user/credential adapter, and the same atomic SYSTEM_ADMIN/profile/SUPERADMIN/bootstrap-audit invariants. The user-selected initial secret was hashed in memory, never printed, exported or added to source/documentation; no general bootstrap CLI/password-policy change was introduced. The temporary script was removed.

Creation committed successfully. Native login returned HTTP 200; a verified session resolved to SYSTEM_ADMIN with an explicit SUPERADMIN grant, no SR profile and no tenure requirement. The protected account endpoint correctly denied access with PASSWORD_CHANGE_REQUIRED until the required first rotation. The immutable SYSTEM_ADMIN_BOOTSTRAPPED audit was present. Only the verification session was removed afterwards; no other sessions, existing SR identities, manual-active flags or period memberships were changed. Browser/manual first-password rotation and assignment of approved periods to the existing roster remain pending. No Production target was accessed and no commit was pushed.

### Administrator account/period UI update (2026-10-19)

The account directory remains `/admin/users`; period configuration/assignment is now `/admin/periods`, also linked in the administrator sidebar. Both pages share the cached account snapshot. Search/filter/navigation are local; writes invalidate the cache and the account directory has explicit refresh. Edit, archive and password reset use themed accessible dialogs; reset credentials are displayed only in memory and cleared when the dialog closes. Account archival uses the existing manual `is_active` flag, keeps the account in the directory and preserves all history. Component sources/license: [UI attribution](ui-attribution.md).

**New migration:** `20261019033819_admin_account_maintenance` expands only the audit action CHECK with `ACCOUNT_UPDATED` and `ACCOUNT_ARCHIVED`. No new table, user-data rewrite, environment variable or dependency is introduced. Apply this migration before exercising edit/archive on a configured environment; without it, the audited transaction rolls back. It was applied only to a fresh, dedicated local PostgreSQL 17 scratch database for tests. **It has not been applied to staging/production in this update.** Remote migration requires explicit authorization under AGENTS.md; existing credentials are not an approval.

Verification for this update:

- `bun run test:offline`: **272 passed / 5,074 assertions**. The first sandboxed run could not bind the loopback HTTP listener; the permitted local rerun passed.
- `bun test apps/web/src/config/navigation.test.ts`: **3 passed / 65 assertions**.
- `RESORA_ADMIN_LIFECYCLE_TEST_DB_URL=<fresh loopback scratch URL> bun --no-env-file test packages/api/src/modules/identity/account-lifecycle.integration.test.ts`: **16 passed / 111 assertions**, including audited edit/archival, session revocation, login denial/restoration, stale and concurrent writes, immutable participant snapshots and audit-failure rollback. The scratch guard refuses remote/nonempty databases. An initial connection check ran before container readiness and was rerun after `pg_isready` succeeded.
- `tsc --noEmit` in `apps/web` and `packages/api`: passed.
- `next build` in `apps/web`, `tsdown` in `apps/server`: passed. No deployment was performed.
- `biome check .` and `git diff --check`: passed.

The test-only Docker container was removed after verification. No remote data/account mutation was performed. Browser/visual testing was not run; keyboard focus/return, tooltip hover, clipboard permissions, mobile sizing, dark theme and the complete administrator workflow still require manual UAT. Local commits remain on `feat/admin-account-lifecycle`, without push.

## 9. Rumahweb VPS Compose production (Phase 2; not deployed)

`docker-compose.yml` preserves the local built-container workflow (web localhost:3001,
API localhost:3000; optional `--profile local-db`). This phase adds no hot reload.
Web now listens on unprivileged container port 3001 to run as user `node`.
`docker-compose.prod.yml` is standalone: **do not merge it with development Compose**.
Production has only web/server, no host application ports or local database. The
project-scoped default bridge permits backend egress to Supabase. Only web also
joins the existing external `resora-proxy` network with alias `resora-prod-web`.
There is no NPM service/dashboard configuration change in this repository.

### Private production environment

Create `.private/production/` (directory 0700) and its `web.env` and `server.env`
files (0600), outside Git. Use `apps/web/.env.example` and
`apps/server/.env.example` as templates. **Replace the synthetic backend key and
connection before runtime**. The production build mounts these tracked synthetic
templates, never the private production files. Dev builds retain existing env
secret mounts. The frontend and backend runtime users are non-root (`node`).

- Web: `NODE_ENV=production`, `NEXT_PUBLIC_SERVER_URL=/`,
  `SERVER_URL=http://server:3000`, `API_UPSTREAM_URL=http://server:3000`.
  Compose pins these public/internal routing settings consistently at build and runtime.
  `getServerUrl()` resolves `/` to the browser origin and uses `SERVER_URL` for SSR;
  auth, tRPC and the existing backup endpoint use existing Next rewrites. Rewrites
  and public URL changes require rebuilding the web image.
- Server: set a strong unique `BETTER_AUTH_SECRET` (at least 32 characters), the
  production Supabase `DATABASE_URL`, and `DB_SSL_CA` containing the project's
  trusted PEM CA. Use quoted multiline dotenv syntax for the certificate. With
  `DB_SSL_CA`, remove all SSL query parameters from `DATABASE_URL`; existing code
  requires certificate/hostname verification. Do not disable verification.
- Get the actual host/role from the project's Supabase Connect dashboard; percent
  encode password characters. Session Pooler on 5432 supports IPv4-only persistent
  backends; direct connection requires working IPv6 or the applicable IPv4 option.
  No automatic fallback. Do not copy workstation Development credentials to production.
- Compose pins `BETTER_AUTH_URL=https://telkomdormitory.com`,
  `CORS_ORIGIN=https://telkomdormitory.com`, `NODE_ENV=production`, and
  `DATABASE_BACKUP_ENABLED=false`. Wildcard DNS grants no wildcard auth/CORS support.
- Phase 3: set `AUTH_PROXY_SECRET` privately in server.env and the matching NPM
  location header (section 10). It is required by persistent production startup,
  absent from build/web env, and separate from `BETTER_AUTH_SECRET`.
- Keep `AUTH_RATE_LIMIT_ENABLED=true`, `AUTH_PERF_DIAGNOSTICS_ENABLED=false`;
  `DB_POOL_MAX=3` is a conservative starting value, subject to measured load and
  Supabase limits. Keep `DIRECT_DB_URL` absent from runtime unless separately needed.
  No migration, seed or provisioning runs at container startup.

Builds retain existing workspace dependencies; broad image pruning is deferred.
On a separate build-only machine, the Compose-required runtime env file paths may
contain copies of the synthetic templates; no production credentials are needed
there. Provision real runtime files only on the deployment host.

Logs rotate at 10 MB × 3 per service. Do not build both images concurrently on
this 1 GB VPS. Prefer building on a compatible, sufficiently provisioned machine
and transferring reviewed images; build resource needs on the VPS are unverified.

### Nginx Proxy Manager (operator setup; not executed)

Use a Proxy Host for `telkomdormitory.com`, scheme `http`, forward hostname
`resora-prod-web`, forward port `3001`. Enable WebSocket support if needed and
configure a valid TLS certificate and Force SSL. The existing NPM container must
already join `resora-proxy`. Do not proxy directly to the backend or publish app
ports. Preserve NPM's localhost-only dashboard and existing host 80/443 ownership.
Do not add wildcard Proxy Hosts/CORS/cookie domains without approved requirements.

### Review gates and recommended deployment commands

**Go-live gate:** Phase 3 implements authenticated NPM client-IP metadata without
changing `trust proxy` or the limiter. The operator must apply and verify the
location-scoped NPM headers and private runtime secret described in section 10.
Phase 2 alone did not solve client-IP attribution.
Also verify production schema/migration compatibility, TLS connectivity, auth
cookies/origin behavior, UAT, resource usage and recovery before directing users.
The HTTP healthchecks show liveness only, not database/auth readiness.

After PM review and separate deployment authorization, the operator may run:

```sh
# Set the full 40-character SHA from a successful, reviewed GHCR workflow run.
export RESORA_IMAGE_TAG='<full-40-character-commit-sha>'
# Parse without private runtime files (safe repository check):
docker compose -f docker-compose.prod.yml config --no-env-resolution --quiet
# On the approved VPS, after private runtime files are provisioned:
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d --no-build --pull never --wait
docker compose -f docker-compose.prod.yml ps
```

These are instructions, not an executed deployment. `up` does not create the
external NPM network. Use only the production file; adding the development file
can reintroduce published ports and local env. Do not run migrations as part of
these commands, or use `down -v` to resolve startup problems. No production
connectivity, NPM routing, or release sign-off is implied by Compose validation.


### Phase 2 local verification (2026-10-18)

Development Compose (with/without `local-db`) and standalone production Compose
validated; production runtime resolution was checked with synthetic env overrides.
Both production images built from the existing lockfile. Final images run as
`node`, contain no `.env*` value files (schema/example files allowed), and are
approximately 1.80 GB web / 1.98 GB server uncompressed; dependency pruning remains
deferred. Budget image storage plus Docker cache and NPM/OS usage separately.
Backend typecheck, focused Biome check and 257 offline tests passed (HTTP fixture
tests needed permission to bind loopback outside the sandbox).

Two synthetic containers on a temporary internal network passed HTTP liveness and
same-origin auth rewrite checks with no published ports. Only the test container
had rate limiting disabled to avoid database access. The 53 browser static assets
contained neither the synthetic backend credential markers nor development/internal
API URL markers; the built rewrite manifest targets `http://server:3000`. Temporary
containers/network were removed. Image builds/cache remain local. No production
database connection, NPM/VPS configuration, login/UAT, migration or deployment was
performed. These checks do not clear the client-IP/rate-limiter go-live blocker.


## 10. Client IP and auth limiter (Phase 3; operator verification pending)

### Investigated request paths

| Path | Selected limiter IP |
| --- | --- |
| Direct development → Express, no proxy secret | Socket peer; all client forwarding headers are ignored/overwritten. |
| Development browser → Next rewrite → Express, no proxy secret | Next socket peer; development direct API workflow is unchanged. |
| Production NPM → Next rewrite → Express before Phase 3 | Next container IP, shared by clients. |
| Production with `AUTH_PROXY_SECRET` | NPM's single validated `X-Resora-Client-IP`, authenticated by its token. Invalid/missing metadata is 403 before Better Auth. |
| Existing separate Vercel entrypoint | Existing validated single `x-vercel-forwarded-for` policy; unchanged. |
| Next SSR → tRPC | Existing cookie/session query; not an HTTP auth login limiter entrypoint. SSR does not forward the proxy credential. |

Express `trust proxy` remains false. Application auth never selects `req.ip` or
`req.ips`. Better Auth reads only the server-selected `x-resora-client-ip` and
retains its 75 requests / 60 seconds per login/password-change path. Production
uses the existing database storage; development uses memory. IPv6/NAT grouping
remains Better Auth's existing policy, not a new per-user/account limit.

The inspected installed Next.js implementation fills missing `x-forwarded-for`
from its socket and preserves an existing value. Its external rewrite proxy
forwards custom headers and changes the upstream Host. Thus XFF alone does not
prove origin and must not be trusted merely because the peer is Next. NPM's
standard proxy include appends XFF, whereas its custom-location template sets it
to `$remote_addr`; the installed NPM version/configuration still needs operator
inspection. Neither format is used for this auth decision.

### Operator NPM configuration (not applied)

1. Generate a separate random secret privately (for example `openssl rand -hex 32`)
   and store it as `AUTH_PROXY_SECRET` in `.private/production/server.env`.
   Do not reuse the auth signing secret, put it in web/build env, commit it, paste
   it into tickets, or enable request-header logging. Protect NPM config/database
   backups because its configuration contains this credential.
2. In the `telkomdormitory.com` Proxy Host, create/configure Custom Location `/api/auth/`,
   scheme `http`, hostname `resora-prod-web`, port `3001`. In **that location's**
   Advanced configuration, set the following, substituting the private secret:

   ```nginx
   proxy_set_header X-Resora-Client-IP $remote_addr;
   proxy_set_header X-Resora-Proxy-Token "<same-private-AUTH_PROXY_SECRET>";
   ```

   These directives overwrite incoming client values. Do not use
   `$http_x_resora_client_ip`, `$http_x_resora_proxy_token`, or XFF as the source.
   Do not add an extra `location` block or `proxy_pass` to this field; NPM owns them.
   Keep the HTTPS certificate, Force SSL and existing access settings. The existing
   default `/` location stays in place for other routes. Any more specific auth
   location must have the same overwrites.
3. Inspect the rendered config locally on the VPS (for example `nginx -t` and a
   private inspection of `nginx -T` inside NPM). Do not paste its secret-bearing
   output into this repository/chat/logs. Confirm the two directives are in the
   **effective location**, not only the Proxy Host's server-level Advanced field:
   location-level `proxy_set_header` directives can prevent inheritance.
4. Confirm `$remote_addr` is the actual TCP client address. Audit `real_ip_header`,
   `set_real_ip_from`, and `real_ip_recursive`; do not trust arbitrary internet
   sources. This design assumes NPM is the public edge. A CDN/load balancer before
   NPM requires a separate exact-source real-IP audit; do not guess trusted ranges.
5. Recreate the backend with the matching private secret after approved deployment.
   Rebuild the backend for this code change; no frontend rebuild or database
   migration is required. Persistent production startup fails without the secret.
   Development leaves it unset; Vercel's separate entrypoint is unchanged.

References: official NPM [custom-location template](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/backend/templates/_location.conf),
[standard proxy include](https://github.com/NginxProxyManager/nginx-proxy-manager/blob/develop/docker/rootfs/etc/nginx/conf.d/include/proxy.conf),
and Nginx [proxy header inheritance](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_set_header).
Templates describe upstream source, not evidence of the installed VPS version.

### Trust and limitations

The token authenticates the ingress metadata across the existing HTTP Docker
chain. Backend verification uses a constant-time comparison for equal-length
credentials and validates a single IPv4/IPv6 address; arrays, comma chains, ports,
invalid addresses and zone suffixes are rejected. The token is stripped before
Better Auth receives the request. XFF, X-Real-IP, Vercel headers and forwarded chains
cannot override an authenticated IP. With proxy mode enabled, bad metadata is
rejected rather than falling back to the frontend IP or an attacker-chosen bucket.

Only NPM and the backend need the secret. Next forwards the per-request header but
has no configured copy. NPM must overwrite both headers even when the public client
supplies them. A compromised NPM/frontend/backend/Docker host, leaked token, or
unsafe NPM real-IP configuration is outside that guarantee. Maintain the existing
network boundaries/no published application ports. Rotate this ingress credential
manually in NPM and backend together if compromised; no automatic rotation was run.

CLI tests use the actual Better Auth limiter with synthetic invalid credentials
(400 before account/session DB operations), exercise separate IP buckets and the
76th-request 429, change spoofed forwarding headers between attempts, reject bad
proxy credentials/IPs, and retain normal session reads. Existing adapter-double
tests cover production database-backed shared counters separately; no PostgreSQL
concurrency or real login against production is claimed. Complete live NPM
header/source checks and synthetic two-client UAT after PM-approved deployment
before clearing the go-live gate. No VPS/NPM settings have been changed here.


### Phase 3 local verification (2026-10-18)

- 260 offline tests across 34 files passed; focused ingress/limiter/session suite
  passed 32 tests. Backend typecheck, focused Biome, Compose parsing and diff checks
  passed. The existing production database-adapter algorithm tests passed without
  connecting to a database; production PostgreSQL concurrency remains unverified.
- The backend production image built successfully. Missing ingress secret caused
  startup failure as required. Through the unchanged Next standalone image on a
  temporary internal Docker network, valid metadata from two synthetic IPs reached
  auth successfully; missing/forged tokens and chained IPs returned 403. No token
  was reflected. Limiter was disabled only for this production-image smoke test to
  avoid database access; actual limiter behavior was covered by the CLI tests.
- The updated image also started in development without a proxy secret; its normal
  session endpoint returned 200/null with the actual memory limiter active, even
  with spoofed forwarding headers. No database was accessed.
- Temporary test containers/network were cleaned up. No real production secret,
  database connection, schema/session persistence change, NPM/VPS configuration,
  migration or deployment was involved. Live edge overwrite/source verification
  remains pending PM review and approved operator execution.


## 11. Permanent CI/CD and artifact promotion (configured; remote runs unverified)

Branch flow is `feature/fix → dev → staging → main`. Integration checks are
automatic, publication is automatic on staging pushes, and all deployment remains
manual. No workflow has `workflow_dispatch` or a deployment step.

| Workflow | Trigger | Token permissions |
| --- | --- | --- |
| `CI — Code Quality` (`ci.yml`) | PR targeting `dev`, `staging`, `main` | `contents: read` |
| `CI — Docker Build` (`docker-verify.yml`) | PR targeting `staging` only | `contents: read` |
| `CD — Publish Images` (`docker-publish.yml`) | Push to `staging` only | `contents: read`, `packages: write` |

Code Quality retains pinned pnpm, Node 24/Bun 1.3.13, frozen dependency install,
Varlock codegen, Next type generation, Biome, typecheck, offline tests and application
build with synthetic env. Application builds on PRs to main are quality checks,
not new container images. Docker PR verification uses default PR integration merge
checkout, Buildx and `push: false` for both existing Dockerfiles; it never logs in
to a registry. The PR event is `pull_request`, not `pull_request_target`.

After required PR checks and review, merging `dev → staging` triggers publication.
Any direct push to staging also triggers it, so branch protection must restrict
those pushes. The Ubuntu GitHub-hosted runner builds both `linux/amd64` images,
logs in with built-in `GITHUB_TOKEN`, and tags each with that staging push's full
`github.sha` (no latest tag):

- `ghcr.io/tel-u-dormitory/resora-web:<full-staging-commit-sha>`
- `ghcr.io/tel-u-dormitory/resora-server:<full-staging-commit-sha>`

Both carry OCI source/revision labels. Any failed build/push fails the workflow;
there is no ignored build failure. A fixed staging publication concurrency group
serializes runs with `cancel-in-progress: false`, so a newer push does not cancel
an in-flight image pair. GitHub can replace an older pending run with a newer one;
not every intermediate commit is guaranteed a publication. Always check the
successful run's exact SHA instead of assuming the latest branch head is ready.

Buildx uses separate `gha` cache scopes for server and web. Only staging publication
exports cache; PRs only import it, subject to GitHub's branch access restrictions.
No cache is exported to GHCR. This is build acceleration, not artifact promotion;
publication still builds the actual staging commit. See [Docker GHA cache docs](https://docs.docker.com/build/cache/backends/gha/).

BuildKit secret-files mount only `apps/web/.env.example` and
`apps/server/.env.example` at the existing secret IDs. Their synthetic validation
values are not production credentials. `.dockerignore` excludes these templates
from COPY alongside all other env value files; schema files remain included.
Only the three non-secret production web routing values are build args. No
production Supabase, Better Auth or proxy credential is required at build time.
The production runtime secret remains required only when starting the backend.

Production Compose requires `RESORA_IMAGE_TAG` with no default/latest fallback.
Both services share that tag, use their explicit GHCR names, and have
`pull_policy: always`; deploy using the pull/no-build commands in section 9.
Existing build stanzas remain for explicitly requested validation on a sufficiently
provisioned development/build host, never the 1 GB VPS. For an unpushed local
validation tag, provide synthetic runtime env files on that build-only host and run:

```sh
export RESORA_IMAGE_TAG=local-validation
docker compose -f docker-compose.prod.yml build server
docker compose -f docker-compose.prod.yml build web
```

Do not publish such tags as production commit images. Development Compose is unchanged.

For private GHCR packages, the VPS operator must first authenticate privately to
`ghcr.io` using an account/token permitted to read those packages (and required
organization SSO authorization, if applicable). Do not copy the workflow's
short-lived GITHUB_TOKEN to the VPS, put a PAT in Compose, or put credentials on a
command line. Public packages may be pulled anonymously; package visibility and
organization publishing/access policy must be verified by PM. OCI source labels
help associate packages with this repository; existing packages may still require
explicit Actions repository access.

Use only a successful run where **both** images exist for the same SHA. Publishing
two packages is not transactional: failure of the later build/push can leave just
one package updated. Rerun/review publication before deployment rather than mixing
SHA tags. Commit tags are immutable-style names, not registry-enforced immutability;
a rerun can replace a tag, and floating base images can yield different digests.
Record the published digests when approving a release. Preserve the prior approved
SHA for an operator-reviewed rollback. No automatic deployment or rollback exists.

Actual GitHub-hosted execution, registry publication/pull, organization permissions,
package visibility and host rollout remain unverified locally. This task did not
trigger a remote run. After merge, staging pushes trigger publication automatically;
host deployment still needs separate authorization.
Phase 3 NPM client-IP/TLS/UAT gates still apply. Image sizes and runtime memory
remain production capacity considerations; this workflow moves build work off VPS.


### Manual staging and production promotion

1. Feature/fix PRs target `dev` and pass Code Quality/review. The `dev → staging`
   PR must pass both Code Quality and Docker Build before merge.
2. In GitHub Actions, open the successful **CD — Publish Images** run for the
   staging push. Read the full commit SHA from that run's associated commit (the
   build steps' tags use exactly `github.sha`) and record both image digests from
   the build summaries. Confirm both packages have that SHA before using either.
3. An authorized operator pulls that pair and deploys manually to the developer's
   home staging server, using separate staging runtime secrets/origins. The staging
   hostname, TLS/ingress and host configuration remain PM/operator setup; this task
   does not create a staging deployment or assume the production hostname is safe
   there. Production Compose pins production origins, so it must not be used
   unchanged as staging runtime configuration. The images themselves remain unchanged.
4. Run staging UAT and record approval together with the tested image SHA **and both
   digests**, staging source commit, successful publication run, and tested scope.
   Only after UAT approval open the `staging → main` PR and require Code Quality
   plus review. Confirm that the approved staging source/content is what the PR
   promotes; additional changes/conflicts require another staged verification.
5. After main review/merge and separate production approval, use the **recorded
   staging image SHA**, not `git rev-parse HEAD` on main. Merge/squash/rebase can give
   main a different SHA. No Docker verification or publication workflow runs for
   PRs/pushes to main. Pull the existing pair on VPS; do not rebuild:

   ```sh
   export RESORA_IMAGE_TAG='<approved-full-staging-image-sha>'
   docker compose -f docker-compose.prod.yml config --quiet
   docker compose -f docker-compose.prod.yml pull
   # Compare both pulled repo digests with the approved staging record.
   docker compose -f docker-compose.prod.yml up -d --no-build --pull never --wait
   docker compose -f docker-compose.prod.yml ps
   ```

   The same SHA/digests must be used at staging and production. A rerun can replace
   a SHA tag: if its digests differ from the approved record, stop instead of
   silently deploying changed artifacts. Retain the prior approved pair for a
   separately authorized rollback. No automatic promotion/deployment is configured.

### Branch protection (PM applies manually)

| Target PR | Required status checks |
| --- | --- |
| `dev` | `CI — Code Quality` |
| `staging` | `CI — Code Quality`, `CI — Docker Build` |
| `main` | `CI — Code Quality` |

The quality and Docker jobs have explicit names matching this table. After the
first actual workflow runs, choose the corresponding **job status checks** in
GitHub Branch Protection/Rulesets; workflow display names alone are not settings.
Require a PR and reviewer approval before merge, restrict direct pushes to these
branches, and disallow force pushes/deletion as appropriate to repository policy.
Configure strict/up-to-date checks if that is the team's integration requirement.
No repository settings/rulesets were changed by this implementation. Required
checks/review settings are necessary because `push: staging` cannot distinguish a
reviewed merge from a direct push. UAT approval remains a manual release gate.
