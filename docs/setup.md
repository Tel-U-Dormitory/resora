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

## 5. Optional local PostgreSQL

External Supabase is the default for Compose: `docker compose config --services` lists web/server; PostgreSQL is behind the `local-db` profile. `DATABASE_URL` is taken from `apps/server/.env` without a local override, and the server has no mandatory PostgreSQL dependency.

For isolated local development:

1. Run `pnpm run db:start` (or `pnpm run db:watch`). Explicitly selecting `postgres` enables that profiled service.
2. Wait for `docker compose exec postgres pg_isready -U postgres` to succeed.
3. Privately configure `DATABASE_URL` for the local DB (`localhost:5432/resora` for Bun on the host); clear `DIRECT_DB_URL` for local-only migrations. For containerized Express use hostname `postgres` instead. Keep the database password consistent with `POSTGRES_PASSWORD`; the scaffold's default is disposable local development only.
4. Run `pnpm run db:check`. Apply reviewed local migrations only when intentionally requested.

For a fully local Compose stack, use `docker compose --profile local-db up -d --build` after the database is healthy and the server env is configured for hostname `postgres`. For external Supabase use the existing `pnpm run docker:up`. These commands start services and are manual verification steps, not Phase 1 deployment approval. Builds require the existing `apps/web/.env` and `apps/server/.env` as BuildKit secrets. The browser API URL stays `http://localhost:3000`, while server-to-server traffic uses `SERVER_URL=http://server:3000`.

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

The seed ensures the [canonical dictionaries](modules/need-001/resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries) (7 departments, 7 positions, 18 buildings). Rerun inserts zero rows and preserves building UUIDs/assignments. Legacy codes (including KADIV), mismatched names or inactive entries abort atomically with explicit conflict codes; review existing data rather than deleting or overwriting it. The old retained Phase 2A.5 scratch database has synthetic legacy references; Phase 3 uses separate `resora_identity_test_phase3_20261011`. No Supabase seed/import or new migration is authorized.

### Phase 2C: internal CSV provisioning (local synthetic imports only)

Use a disposable loopback PostgreSQL database named `resora_identity_test_*` with the three existing migrations. Set `RESORA_IDENTITY_TEST_DB_URL` privately in the process, as for the guarded integration suites. The CLI checks both the URL and actual server host/database/port before account writes. It ignores `DATABASE_URL`/`DIRECT_DB_URL`, loads no `.env` files, and rejects remote targets. No migrations are part of provisioning. An authorized real-environment rollout is a later approval gate, not a current CLI option.

UTF-8 input (optional BOM, RFC CSV quoting, maximum 5 MiB/5,000 accounts):

```csv
nim,name,email,department,position,building,is_active
000260000001,Synthetic SR,synthetic-sr@example.invalid,HCO,ANGGOTA,A,true
```

Use the [canonical 7/7/18 organization codes](modules/need-001/resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries), including KADEP instead of legacy KADIV and separate buildings A–F / 1–12. These organization **codes** must already exist and be active in the local dictionaries; the importer never creates or changes organization records. Header order may vary, but all seven columns are mandatory, with no extra columns. NIM stays a string using the configured Username Plugin validation. Email is normalized to lowercase; `is_active` accepts `true`, `false`, `1`, `0`. Do not open/save the roster through spreadsheet number coercion; import NIM as text. Use only synthetic names/emails in this phase.

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

## 8. Work sequence before 2026-10-18

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
