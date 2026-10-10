# RESORA — Repository Setup & Pilot Readiness

> This is an actionable setup checklist. The scaffold and app have **not** been created by this documentation package. Commands should be run on the developer workstation in an empty parent directory.

## 1. Prerequisites
- Recent supported Bun and Node.js LTS per Better-T-Stack prerequisites, Docker Engine/Compose, Git.
- Verify `bun --version`, `node --version`, `docker compose version`, `git --version`.
- Do not create a public repo containing real SR identity spreadsheets or credentials.

## 2. Scaffold (single line)

```bash
bun create better-t-stack@latest resora --frontend next --backend express --runtime bun --api trpc --auth better-auth --payments none --database postgres --orm drizzle --db-setup docker --package-manager bun --git --web-deploy docker --server-deploy docker --install --addons turborepo biome --examples none --yes
```

To preview a **new** directory creation, append `--dry-run`. Do not use `--directory-conflict overwrite` on a nonempty repository. This guide was checked against https://www.better-t-stack.dev/docs/cli/options (October 2026); later versions may differ.

## 3. Install this documentation package
Extract `resora-docs.zip` **inside the generated `resora/` directory** so `AGENTS.md`, `docs/prd.md`, `docs/architecture.md`, etc. are in the repo root. If the generator creates any same-named files, inspect differences first.

## 4. Bootstrap verification
1. Inspect `package.json`, `turbo.json`, `bts.jsonc` and the actual `apps/*`, `packages/*` structure; record exact names/scripts in this file if different from docs.
2. Set required environment keys via generated `.env.example`/validation schema; **no plaintext secrets in git**.
3. Start PostgreSQL via generated compose/database script, then run reviewed Drizzle migrations.
4. Verify Better Auth auth tables and test dummy signup/signin in **isolated local dev** only; prohibit public registration before pilot.
5. Run Bun dev commands for Next and Express; verify typed tRPC health/sample request and browser ↔ API cookie/CORS flow.
6. Run generated Biome check, TypeScript checks and tests; establish CI before production.
7. Add API and DB modules incrementally according to `docs/architecture.md`.

## 5. Authentication bootstrapping (critical)
- Add Better Auth Username Plugin on server and client; migrate schema for `username` field.
- Set `username = NIM` for SR accounts. Numeric NIM strings remain strings to preserve leading zeros.
- Better Auth's underlying sign-up still expects `email`, `name`, `password`; PM must decide legitimate email strategy before importing real records.
- Create a privileged, **non-public** provisioning script/CLI for imports, validate unique NIM, actor SR, assigned department/building, position. Seed synthetic development-only accounts for tests.
- Cryptographically random initial passwords, safe one-time distribution, first-login reset required. Keep import evidence private, not in repo.
- Don't enable a forgot-password flow that sends to dummy/unowned email addresses.

## 6. Work sequence before 2026-10-18
| Order | Work / gate | Responsibility |
|---|---|---|
| 1 | Create repo, env and local DB; smoke tests | RnD |
| 2 | HCO confirms event window/QR/geofence/manual rules | PM + HCO |
| 3 | Create initial department/building/SR import plan and username auth | PM + RnD |
| 4 | Implement event + reusable QR service + attendance DB and tRPC | RnD |
| 5 | Implement SR flow, HCO event/recap/export, KADIV correction | RnD |
| 6 | Security and load tests; real mobile/GPS trial | QA + HCO |
| 7 | Backup, deployment, HTTPS and UAT approval | DevOps + PM |

This is a dependency sequence, **not** a fabricated daily sprint schedule.

## 7. Production gate
- [ ] No public self-registration; only authorized SR imported.
- [ ] Credentials distributed securely; forced change and recovery policy verified.
- [ ] HCO/KADIV/other SR permission matrix tested.
- [ ] Geo default, 15 min late threshold and event window policy reviewed by HCO.
- [ ] Expired QR, duplicate, GPS denial and pending/approved/rejected manual scenarios pass.
- [ ] PostgreSQL backup and restore tested; secrets rotated from defaults; HTTPS active.
- [ ] UAT signed off by PM and HCO policy owner.

Useful docs: https://www.better-t-stack.dev/docs/project-structure | https://www.better-t-stack.dev/docs/guides/docker | https://www.better-auth.com/docs/plugins/username
