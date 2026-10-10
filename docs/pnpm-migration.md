# pnpm migration verification

**Scope:** pnpm 10.33.4 package management; Bun 1.3.13 retained for Express, Bun TypeScript tools and existing tests. No application/auth/schema changes, migrations, `db:push`, production changes or secret-file edits.

## Changed files

- `pnpm-workspace.yaml`: all apps/packages, unchanged catalog ranges, existing Next/Varlock override, esbuild/sharp build-script allowlist.
- `pnpm-lock.yaml`: imported resolved versions; replaces `bun.lock` after successful installation.
- `package.json`: pinned pnpm, pnpm script delegation, read-only `lint` and existing-test `test:smoke` scripts.
- `apps/server/package.json`, `packages/db/package.json`: pnpm package-manager commands; Bun runtime commands retained.
- `apps/server/Dockerfile`, `apps/web/Dockerfile`: Corepack/pnpm frozen installation and shared pnpm store cache. Server image includes Node for pnpm-generated Varlock CLI shims but starts Express with Bun. Web retains Next.js standalone, static/public files and Varlock CLI dependencies.
- `docker-compose.yml`: installation comment updated; external Supabase, optional local PostgreSQL, build secrets and network settings retained.
- `.dockerignore`: exclude package-manager migration artifacts, pnpm store and temporary verification files.
- `AGENTS.md`, `README.md`, `docs/setup.md`, `docs/architecture.md`, `docs/modules/need-001/roadmap.md`, `bts.jsonc`: package-manager commands/metadata only; runtime and product policies retained.
- This report: `docs/pnpm-migration.md`.

The untracked `docs/modules/need-001/resora-need-001-data-model.md` belongs to unrelated work and was not edited. Historical Phase 1 command results in setup remain historical, not rewritten as pnpm executions.

## Dependency preservation

pnpm does not directly import Bun lockfiles. The existing Bun lockfile was exported to a temporary Yarn v1 lock using `bun install --yarn --ignore-scripts --frozen-lockfile`, then imported with `corepack pnpm import`. The temporary Yarn lock and Bun lock were removed only after frozen pnpm installation succeeded. The preliminary `--lockfile-only` export produced no Yarn lock; it made no dependency changes.

Comparison of unique package name/version pairs found **no newly introduced versions**. pnpm stores 611 registry package versions. The Bun lock also represented seven workspace packages as version entries; pnpm represents these through workspace links. Four optional WASM fallback packages were omitted by pnpm's resolution: `@emnapi/core@1.11.3`, `@emnapi/wasi-threads@1.2.3`, `@napi-rs/wasm-runtime@1.2.5`, `@tybys/wasm-util@0.10.4`. Windows native tools and Linux Docker builds passed. No dependency ranges were upgraded.

## Commands and results

Host commands requiring Varlock used the existing temporary PowerShell workaround `$env:VARLOCK_TELEMETRY_DISABLED='1'`; pnpm configuration does not force that preference. `pnpm.cmd` can substitute for `pnpm` under restricted PowerShell.

| Command/check | Result |
| --- | --- |
| `corepack pnpm --version` | 10.33.4. Initial sandbox cache write denied; approved retry passed. |
| `corepack pnpm import` | Passed, using temporary exported lockfile; reported existing deprecated transitive packages. |
| `corepack pnpm install --frozen-lockfile` | Passed across eight workspace projects, including all three Varlock postinstall/codegen targets and native esbuild setup. Existing Bun `.exe` shims were replaced by pnpm shims. |
| `pnpm install --frozen-lockfile` after removing Bun lock | Passed; no resolution changes; all three codegen targets passed again. |
| `pnpm.cmd run env:generate` | Explicit codegen check passed for all three schemas, preserving Varlock management. |
| `pnpm list -r --depth -1` | Root plus two apps and five packages present. |
| `pnpm run check-types` | All six available workspace tasks passed. |
| `pnpm run build` | Express/tsdown and Next.js production standalone builds passed. Recheck after an interrupted tool turn confirmed both completed tasks through Turbo cache. |
| `pnpm run test:smoke` | Four existing Bun tests passed (11 assertions): runtime/migration connection selection and safe failure diagnostics. |
| `pnpm run lint --max-diagnostics=5 --reporter=summary` | Final result: 89 errors, 69 warnings, 2 infos from existing scaffold formatting/import/accessibility issues. No fixes applied; unrelated UI files were not changed. |
| `pnpm.cmd exec biome check --formatter-enabled=false package.json apps/server/package.json packages/db/package.json` | Passed. Existing JSON indentation retained to keep the change focused. |
| `pnpm run db:check` | Passed: backend Bun/Drizzle `DATABASE_URL` executed `SELECT 1`; no credentials logged. |
| `pnpm --dir packages/db exec drizzle-kit --version` | Kit and ORM remain 1.0.0-rc.4; no schema generation or SQL application. |
| Better Auth adapter/workspace resolution | Adapter resolves from pnpm store and `@resora/db` resolves to the existing workspace source. |
| Next/Varlock resolution | Resolving `@next/env` from Next's dependency context points to `@varlock/nextjs-integration` 1.2.2 `next-env-compat.cjs`. A preliminary check from the web package failed because `@next/env` is a transitive dependency; isolated pnpm resolution correctly keeps it private to Next. No direct dependency was added. |
| `docker compose build` | First build passed for both images, including Linux pnpm frozen install/codegen and Next standalone output. A final rebuild with completed documentation/temp-file exclusions failed with `ERR_PNPM_EIO`: C: had zero free bytes. This repeat is an environment failure and remains unverified after disk recovery. Docker Desktop was started in the background for verification. |
| Isolated Docker runtime smoke | Both images returned HTTP 200 with synthetic environment values and `--network none`. Server reported Bun 1.3.13; web reported Node 24.21.0. Test containers were removed. No database was contacted by container smoke tests. |
| `docker compose config --quiet`, default/profiled service inventories | Passed. Default: web/server; local profile adds postgres. |
| `git diff --check` | Passed. |

## Compatibility notes and commit readiness

Turbo requires an actual `pnpm` executable on PATH: `corepack pnpm run build` initially failed without a shim. Install it with `corepack enable pnpm`; on this Windows workstation the user-writable alternative `corepack enable --install-directory "$env:APPDATA\npm" pnpm` fixed resolution. Restricted PowerShell may block `pnpm.ps1`; use `pnpm.cmd`, preserving execution policy. Docker builders install Corepack shims explicitly.

The known Windows Varlock telemetry assertion still requires the existing temporary workaround during verification. Dependency versions and Varlock management were preserved. Full-repository Biome remains a pre-existing failing gate; the migration does not fix unrelated formatting or accessibility issues.

The final Docker repeat encountered a full host C: drive (read-only disk diagnostics reported zero free bytes; E: still had space). The stalled build CLI was stopped. Approved cleanup was attempted only for the two immutable image IDs produced by this task, but Docker returned API 500 errors, so image removal is unconfirmed. No database volumes, unrelated images, global caches or resources were pruned. A later disk check showed about 0.83 GiB free on C:, still insufficient for a reliable rebuild. Free more space or relocate Docker's disk through your workstation settings, restart Docker Desktop, then rerun `docker compose build`. The successful first builds and container smoke results remain valid evidence; the final repeat is not reported as passing.

Phase 1 runtime/direct URL selection, connection diagnostics, explicit pooler alternative, schemas and migration files have no source diff. Direct Supabase connectivity was not revalidated in this migration; the prior DNS/IPv6 limitation remains documented. No migrations were run.

The package-manager code is ready to review and commit as its own change, with the existing Biome failure and disk-blocked final Docker repeat disclosed. The overall verification is not a completely green gate. Stage only the listed migration files and the deletion of `bun.lock`; leave the unrelated data-model document out. No commit or deployment was performed.
