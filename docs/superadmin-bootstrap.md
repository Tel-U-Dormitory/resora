# Dedicated SUPERADMIN bootstrap (SA-03)

This is a manual release operation. SA-03 authorizes local synthetic testing only; Production/Development migration and bootstrap require separate PM approval. Never upgrade an existing SR, fabricate an SR assignment, insert users in a migration, or run bootstrap at API startup.

## Release order

1. Review/approve the branch and both migrations: `20261013170324_sa02_account_management`, then `20261014034514_sa03_system_admin`. Preserve all earlier SQL/history. Verify the actual target project, migration hashes/schema and fresh backup/recovery readiness; do not assume Production is current.
2. With explicit PM approval, apply only pending versioned migrations using the existing reviewed Production migration procedure in [setup](setup.md). Prefer verified Direct Connection; explicit Session Pooler 5432 is the alternative. No Transaction Pooler 6543, db:push, reset, inferred environment fallback or disabled TLS verification. The new enum must commit before bootstrap inserts it.
3. Deploy the reviewed API/web together only after separate deployment approval. Confirm API startup, same-origin auth/tRPC, HTTPS cookies, trusted origins and SSR gates. Unverified proxy-IP/rate-limit release gates still apply.
4. Preflight bootstrap, then explicitly apply one new SYSTEM_ADMIN account as below. Current chain has nine migrations; the CLI compares every history hash to the checkout. Existing dedicated accounts or SUPERADMIN grants stop bootstrap for review.
5. Verify exactly one new user/credential/profile/grant and bootstrap audit, no SR profile; no changes to existing SR assignments or flags. Check private status.json is COMMITTED before credential handover.

## Explicit inputs and target

PM supplies administrative username (starts with a letter; 3–30 letters/digits/dot/underscore, e.g. `resora.admin`), account name, valid admin email, database name, and approved full project reference. Do not use a student NIM.

Set `RESORA_SYSTEM_ADMIN_BOOTSTRAP_DB_URL` privately for this process only; there is no `.env` load or DATABASE_URL/PROD_* fallback. Production also requires `RESORA_SYSTEM_ADMIN_BOOTSTRAP_SSL_CA` containing its verified CA PEM. Use an explicit Direct/Session connection on 5432 to database postgres; project hostname or pooler username must match `--project-reference`, and the SQL role must be postgres. Do not put URLs/passwords in command arguments, shell history or shared logs.

TLS preflight checks an established bootstrap `pg` connection against the validated hostname: explicit nonblank CA, `rejectUnauthorized=true`, encrypted/authorized live TLS socket, and peer-certificate hostname validation. Missing evidence or connection/certificate errors stop bootstrap without writes. Direct Connection additionally requires `pg_stat_ssl.ssl=true` on that same connection. Session Pooler does **not** use `pg_stat_ssl` as client-side TLS evidence: it describes the pooler-to-PostgreSQL hop, not the bootstrap-client-to-pooler hop. Never disable verification or replace the CA to suppress an error. The common runtime pool configuration is unchanged.

Production preflight **only after approval**, with PM-supplied non-secret argument variables:

```powershell
pnpm.cmd run system-admin:bootstrap -- --target production --database postgres --project-reference $approvedReference --confirm-production --username $adminUsername --name $adminName --email $adminEmail
```

The command defaults to dry-run. If target/history/conflicts/backup gates pass and PM authorizes creation, run the same command with `--apply`. Do not blindly rerun a failed apply. This task has not run either command against Production.

For local testing use explicit `--target local --database <resora_identity_test_...>` and the same account arguments. The URL must be loopback and SQL host/port/role/database must match. No cluster creation/startup, seed or migration occurs in the bootstrap CLI.

## Credentials, first login and recovery

Export is `.private/system-admin-bootstrap/<run-id>/credentials.csv`, with columns `username,name,email,temporary_password`. Existing Git-ignore and restrictive directory/file permissions apply. The 32-character password is never printed, stored in DB/audit plaintext, emailed or cached in the application. Transfer COMMITTED credentials privately through a PM-approved channel, never chat/Git/issues/logs.

Login at `/login` using NIM / Username. The new account must go to `/change-password`; `/dashboard`, `/profile`, admin and operational APIs remain gated until successful Better Auth password change. Confirm the temporary password stops working, other sessions are revoked, logout ends the session, HCO/Administrasi are visible, and Scan/personal attendance history are absent. System profile has username/name/email only; no SR organization values.

- FAILED: transaction did not reach commit acknowledgement; inspect target identity/history and private status before any retry.
- UNCONFIRMED or lost command response: verify username/email, user/credential/profile/grant and bootstrap audit on the approved target; compare the export status. Do not assume success/failure, create another admin or reset an account automatically.
- Existing account with COMMITTED export: do not rerun/bootstrap/reset; use the private export, subject to whether its initial password was already changed.
- Missing credentials or unresolved commit/export state: stop for PM-approved recovery. SA-03 has no password-reset UI or automated recovery procedure; any privileged recovery requires separate approval and audit.

Local integration fixtures/exports are synthetic and never a source of Production credentials. Keep retained immutable audits in their disposable DB; do not disable guards for cleanup.

## Approved staging operation (2026-10-19)

After explicit user approval of staging migrations and a separately supplied administrator identity/initial credential, the configured staging database now contains a dedicated SYSTEM_ADMIN with an explicit SUPERADMIN grant and immutable bootstrap audit. Native login/session verification passed, and mandatory first-password rotation remains enforced. The initial secret was hashed only in memory and was not exported or recorded in this repository. This was a one-off user-authorized staging exception to generated credential handoff; the standard CLI continues generating random temporary credentials. No Production bootstrap is authorized by this record. See [staging verification](setup.md#staging-administrator-bootstrap-result-2026-10-19).
