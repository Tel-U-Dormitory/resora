# RESORA — Preparation of 50 synthetic SR accounts (DEV only)

These files are ADDITIONS to the existing `resora/tests/resora-loadtest` directory.
Do not replace the previously supplied `loadtest.js` and `README.md`.

## Files

- `sr-loadtest-50.csv`: 50 **identifiers**, names, emails, and organizational assignments. NO passwords.
- `convert-credentials.py`: converts a successfully **COMMITTED** RESORA private
  SR-provisioning credentials.csv export into `accounts.local.json` for k6.
- `.gitignore`: prevents locally generated passwords and reports from being committed.

## Guarded DEV runner

`provision-dev.ts` reuses `provisionSrAccounts`. The existing `sr:provision` command
and `localProvisioningTarget()` remain **local-scratch-only** and unchanged.
The runner only accepts `RESORA_LOADTEST_DEV_DB_URL`, plus separately supplied
`RESORA_LOADTEST_DEV_PROJECT_REF` and `RESORA_LOADTEST_PROD_PROJECT_REF`.
No application/Production URL fallback or `.env` auto-loading is used.

Allowed endpoints are `db.<DEV-ref>.supabase.co` with user `postgres`, or
`aws-<number>-<region>.pooler.supabase.com` with user `postgres.<DEV-ref>`,
database `postgres`, port 5432. Transaction Pooler 6543, ambiguous targets,
matching DEV/PROD references and URL hash/other query options are rejected.
Use a correctly encoded base URL, or include only `sslmode=require` and
`uselibpqcompat=true`. The runner sets both options after validating the DEV
endpoint. Installed `pg 8.23.1` / `pg-connection-string 2.14.1` implements libpq
require semantics: encrypted transport is required (no plaintext fallback), but
without a CA it sets `ssl.rejectUnauthorized=false`.

**Temporary DEV-only trade-off approved by PM:** the server certificate chain
and hostname identity are **not verified**. URL/project guards pin the intended
configuration; they do not authenticate the remote server or prevent a MITM.
Use only for this controlled DEV test; do not reuse for Production. There is no
CA file/download workflow or custom TLS verifier in this runner. Shared DB TLS
configuration and Production authentication are unchanged. Connection role/database,
required tables, applied migration hashes and active RND/ANGGOTA/A references
are still checked read-only before provisioning.

Default mode is dry-run. Apply requires `--apply --confirm-dev <DEV-ref>` and
reruns the preview. Only this exact 50-row roster is accepted. Existing users
must be either absent or all 50 identical valid accounts with no privileges.
Partial/conflicting batches stop without resets/deletes. A transaction-time
credential-batch check also rejects a raced partial import before account writes.
Re-running a complete import leaves passwords/flags unchanged and creates no
new credential export. Locate the original COMMITTED export rather than resetting.

## PowerShell execution (after PM approval)

From the repository root, enter the DEV connection URL privately; do not paste it
into command history. References are non-secret but must come from confirmed
DEV/PROD project metadata. Do not infer DEV from a Preview hostname.

```powershell
Set-Location E:\Code\resora
$loadtestSecret = Read-Host 'Supabase DEV Direct/Session Pooler URL (5432)' -AsSecureString
$env:RESORA_LOADTEST_DEV_DB_URL = [System.Net.NetworkCredential]::new('', $loadtestSecret).Password
Remove-Variable loadtestSecret
$env:RESORA_LOADTEST_DEV_PROJECT_REF = Read-Host 'Verified DEV project reference'
$env:RESORA_LOADTEST_PROD_PROJECT_REF = Read-Host 'Known PROD project reference (deny target)'
bun --no-env-file .\tests\resora-loadtest\provision-dev.ts --check
bun --no-env-file .\tests\resora-loadtest\provision-dev.ts --dry-run
# STOP if preflight/preview fails. First import must report 50 new, 0 unchanged/conflicts.
# Only after explicit PM approval and successful checks:
bun --no-env-file .\tests\resora-loadtest\provision-dev.ts --apply --confirm-dev "$env:RESORA_LOADTEST_DEV_PROJECT_REF"
bun --no-env-file .\tests\resora-loadtest\provision-dev.ts --verify
Remove-Item Env:\RESORA_LOADTEST_DEV_DB_URL
```

The apply output gives the private relative path
`.private/sr-provisioning/<run-id>/credentials.csv`. Read only the adjacent
`status.json` to confirm `COMMITTED`; PREPARED/FAILED/UNCONFIRMED requires review,
not automatic retry. Passwords are exactly eight secure random alphanumeric
characters per existing CSV policy; stored hashes, initial-password flags,
atomic creation and export permissions/status semantics are unchanged.

```powershell
$loadtestExport = Read-Host 'Relative credentials.csv path printed by successful apply'
Get-Content (Join-Path (Split-Path $loadtestExport) 'status.json')
$loadtestExport = (Resolve-Path $loadtestExport).Path
Set-Location .\tests\resora-loadtest
py -3 .\convert-credentials.py "$loadtestExport"
New-Item -ItemType Directory -Force .\reports | Out-Null
$env:TARGET_ORIGIN = Read-Host 'Verified isolated DEV Web or API origin'
$env:WEB_ORIGIN = Read-Host 'Exact DEV Web origin allowed by API'
$env:ACCOUNTS_FILE = './accounts.local.json'
# Set only after separately confirming deployment uses DEV DB and obtaining test approval.
$env:APPROVE_ISOLATED_TARGET = 'yes'
$env:VUS = '2'
$env:ACCOUNT_OFFSET = '0'
k6 run --summary-export .\reports\smoke-2.json .\loadtest.js
```

`accounts.local.json` and reports are Git-ignored. Do not enable HTTP debug/body
logging or share credential files. The supplied converter and k6 script are
unchanged. k6 uses a distinct account/cookie jar per VU for 2/5/10/25/50 users.
Observe the existing limiter-window and controlled test sequence in `README.md`;
this runner does not change the limiter, deploy an API, seed references, migrate
or provide cleanup. DEV connectivity/provisioning and real k6 traffic are **not**
verified by offline tests and remain separately approved execution steps.

Do not use raw SQL to insert accounts or store plaintext passwords in PostgreSQL.

## Accounts

- NIMs: `lt_resora_20261014_001` through `_050`
- Email: reserved example.com addresses (not real recipients)
- Department: `RND`
- Position: `ANGGOTA`
- Building: `A`
- Active: `true`

These are accepted by RESORA's `parseSrCsv` schema **if the department,
position and building references are present and active in the DEV DB**.
The provisioning dry-run will verify those references before any writes.

## Once guarded DEV-only provisioning succeeds

1. Verify a private export such as:
   `<repo>/.private/sr-provisioning/<uuid>/credentials.csv` and adjacent
   `status.json` with `state: "COMMITTED"`.
2. In PowerShell, navigate to the existing `tests/resora-loadtest` directory:
   `py -3 .\convert-credentials.py "<repo>\.private\sr-provisioning\<uuid>\credentials.csv"`
3. The converter verifies the roster, count and SHA256 before creating
   `accounts.local.json`, without printing usernames or passwords.
4. The existing k6 script can then read `accounts.local.json`.
5. Confirm the DEV **API deployment** and **DEV DB isolation** before setting
   `APPROVE_ISOLATED_TARGET=yes`.

Do not send credential files to a chat, do not commit private exports, and
do not run load tests against Production.
