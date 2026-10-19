# RESORA - Isolated authentication, QR check-in and VPS public smoke

## Safety gate

`loadtest.js` is for an explicitly verified isolated HTTPS VPS (Nginx Proxy Manager
-> Web -> API -> isolated DEV database), or Preview Web -> Preview API -> isolated DEV.
Use only the approved synthetic roster `sr-loadtest-50.csv`. A staging/Preview hostname and
`APPROVE_ISOLATED_TARGET=yes` are operator assertions, not proof of DB isolation.
Before each series, verify Web/API code revision, Web `API_UPSTREAM_URL`, API
`DATABASE_URL` DEV project reference and `AUTH_RATE_LIMIT_ENABLED=true`.
Do not use Production accounts/traffic or change rate limits, pool settings or deployments.

`TARGET_ORIGIN` and `WEB_ORIGIN` must be the same isolated HTTPS Web origin,
without a path/trailing slash. Direct API testing is not this journey. The known
Production hosts `resora.telkomdormitory.com`, `telkomdormitory.com` (including their
`www` aliases), `resora-telu.vercel.app` and `resora-api.vercel.app` are always refused,
including alternate ports, case variants and trailing DNS dots. Setting
`APPROVE_ISOLATED_TARGET=yes` cannot unlock them. This guard cannot identify every Production alias;
independent target verification is mandatory. Missing approval stops before HTTP.

Use the existing private `accounts.local.json` generated from a COMMITTED synthetic
credential export (see SETUP-ACCOUNTS.md); never copy placeholder credentials or
reset existing accounts. Every selected username must match the approved load-test
prefix/range, have a nonblank password and be unique within the run. No credentials
are printed. Do not enable HTTP debug/body logging, k6 cloud uploads or `k6 archive`
(the latter embeds fixtures). Reports and credential files remain Git-ignored.

## HTTP journey and acceptance

Each VU performs exactly one POST `/api/auth/sign-in/username`, then GET `/dashboard`
through the isolated Web origin. The existing per-VU k6 cookie jar carries the login cookie.
Both requests disable redirect following. Dashboard validation requires HTTP 200,
HTML with the actual Dashboard SR heading, welcome text and the VU's own synthetic
NIM, and no password form or streamed meta redirect. A login page with HTTP 200 fails.
No extra identity.session/privateData request or retry is made.

Metrics:
- `resora_login_ms`, `resora_dashboard_ms`: k6 HTTP duration, excluding connection setup.
- `resora_journey_ms`: elapsed HTTP journey including connection setup between login
  start and dashboard receipt, excluding HTML assertions. Failed attempts are also sampled;
  success/failure counters must be checked before interpreting its percentiles.
- All three trends explicitly export p50/p95.
- `resora_journey_success` must equal VUs, `resora_journey_failed` must be zero,
  journey p95 <= 10000 ms, and all HTTP/network failure counts must be zero.
- `resora_http_429`, `resora_http_4xx` (excludes 429), `resora_http_5xx`,
  `resora_network_failures` are separate counters; redirects/invalid HTML fail the journey too.

These are HTTP timings including server-rendered HTML, not browser paint, hydration,
asset loading or rendering measurements. The script does not execute JavaScript.

## Isolated VPS/Preview execution from a Windows laptop

Run k6 on the separate laptop, not inside the VPS. Before approval, independently
verify the isolated hostname, NPM upstream, Web/API image or code revisions, API
database DEV reference, and limiter ON. Do not use a production backend behind a
staging hostname. The script does not inspect deployment or database configuration.
Use an existing isolated deployment; this task does not provision one.

From repository root, then `tests/resora-loadtest`, set the confirmed origin and private fixture:

```powershell
Set-Location tests/resora-loadtest
$env:TARGET_ORIGIN = '<verified isolated VPS or Preview HTTPS Web origin>'
$env:WEB_ORIGIN = $env:TARGET_ORIGIN
$env:ACCOUNTS_FILE = './accounts.local.json'
$env:APPROVE_ISOLATED_TARGET = 'yes' # Only after independently verifying every hop and limiter ON.
$env:ACCOUNT_OFFSET = '0'
$env:VUS = '2'
# For VPS, remove inherited Preview secrets; they are only forwarded to vercel.app origins.
Remove-Item Env:VERCEL_WEB_BYPASS_SECRET, Env:VERCEL_BYPASS_SECRET, Env:VERCEL_API_BYPASS_SECRET -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force ./reports | Out-Null
k6 inspect -e "VUS=$env:VUS" --execution-requirements ./loadtest.js # Local compilation only; no HTTP.
$run = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
k6 run -e "VUS=$env:VUS" --summary-export "./reports/isolated-$run-$($env:VUS)vu.json" ./loadtest.js
Remove-Item Env:APPROVE_ISOLATED_TARGET
```

Run 2, 5, 10, 20, 25, then 50 VUs **manually, one run at a time**, with at least 65 seconds
after each completed run and no competing login traffic. Change VUS/report filename
together, re-confirm isolation/approval for each run, and record start/end UTC times;
stop on any failed check, threshold, unexplained HTTP failure or timeout.
Do not automatically escalate after failure or switch the limiter OFF. Earlier
API-only/limiter-OFF experiments are historical. Users on the same public IP still
share the existing per-IP limits; do not treat a 429 as a network failure or bypass it.

Protected Preview requires an existing, approved automation bypass. Load its value
privately into `VERCEL_WEB_BYPASS_SECRET` (`VERCEL_BYPASS_SECRET` remains a fallback); never put the value in commands/reports/Git.
`loadtest.js` never sends `VERCEL_API_BYPASS_SECRET` to Web. The separate QR entry
point may use it only in explicit `api-direct` mode, described below.
Web/API are different projects: verify bypass forwarding works for both; do not
create bypasses or disable deployment protection merely to run this test. A 302 to
vercel.com or an authentication-protection page is a blocker, not an application result.

## Production public smoke (separate, explicit approval required)

`smoke-public.js` only GETs the fixed URL `https://resora.telkomdormitory.com/login`.
It has no account fixture, login POST, provisioning, bypass header or supplied cookie.
`TARGET_ORIGIN` cannot redirect this entry point to another target. Redirects are
not followed and count as HTTP failures. Use only after separate approval for this
small live check; no remote test was executed as part of this implementation.

From `tests/resora-loadtest` on the laptop:

```powershell
$env:APPROVE_PRODUCTION_SMOKE = 'yes' # Explicit approval for this live public smoke only.
$env:SMOKE_VUS = '1' # 1..5; default 1. Independent of authentication-test VUS.
New-Item -ItemType Directory -Force ./reports | Out-Null
$run = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
k6 run --summary-export "./reports/public-smoke-$run.json" ./smoke-public.js
Remove-Item Env:APPROVE_PRODUCTION_SMOKE, Env:SMOKE_VUS
```

The scenario runs one iteration/GET per VU, at most five requests. Do not override
scenarios, iterations or duration using CLI flags or external k6 configuration.
`resora_public_smoke_ms` reports HTTP p50/p95 (excluding connection setup).
`resora_public_smoke_ok` must equal SMOKE_VUS; HTTP errors (all non-200 responses,
including redirects) and network failures (status 0) must be zero. No latency SLA
is inferred from this tiny sample. Built-in `http_req_failed` may classify redirects
differently; use the smoke checks/counters for acceptance.

This measures public endpoint availability/HTTP latency only, **not authenticated
capacity, browser rendering, or 50-user Production readiness**. A public GET may
perform server-side reads; this is not proof of zero database activity. No write
or authentication operation is requested by the script. Isolated DEV-backed results
must be labeled separately from Production public smoke results.

## VPS configuration finding (no configuration changed)

`docker-compose.prod.yml` currently pins `BETTER_AUTH_URL` and `CORS_ORIGIN` to
`https://telkomdormitory.com`, whereas the supplied VPS origin is
`https://resora.telkomdormitory.com`. Compose `environment` entries override
`env_file` values. This can affect auth base URLs and trusted origins; PM must review
and correct the deployment configuration in a separate authorized change before
claiming authenticated VPS readiness. This script change neither verifies the live
configuration nor fixes it.

## Correlate with server observations

Record UTC run windows, both deployment revisions, VUs, all p50/p95/counters and
threshold status. Correlate with Preview API `AUTH_REQUEST_RESULT` (LOGIN,
IDENTITY_SESSION; DASHBOARD_DATA is no longer expected after Phase 3), poolWaiting
and HTTP 5xx within that same window if Vercel log access is available. Do not export
raw runtime messages containing secrets or identity data. Shared HTTP batch timing
is not per-resolver timing; pool snapshots are not peak utilization.

For a VPS, have an authorized operator use the existing server access to observe
the **matching environment** while the laptop sends traffic. No SSH or infrastructure
changes are needed. These commands are for the operator, not the laptop:

```sh
# At the matching deployment directory. Sample repeatedly during the short wave,
# or use interactive `docker stats` for continuous observation.
docker stats --no-stream
docker compose -f docker-compose.prod.yml logs --since '<UTC-run-start>' --timestamps server web
```

Use the isolated deployment's actual Compose file/project for authenticated testing;
do not assume the Production Compose file identifies the isolated stack. Record
container CPU, memory, network/block I/O, restarts and existing request-failure
diagnostics for the same UTC window. `AUTH_REQUEST_RESULT` status, duration and
poolTotal/poolIdle/poolWaiting can help distinguish proxy errors from DB acquisition
queues. Successful diagnostic logs depend on the existing opt-in setting; missing
success logs are not evidence of failure. Do not change runtime settings as part of
this test preparation, or share raw logs with identifiers/secrets.

## Authenticated QR check-in (prepared, live execution BLOCKED)

`qr-checkin.js` is a separate entry point; existing dashboard and public smoke tests
are unchanged. It is pinned to this supplied Preview pair:

- Web: `https://resora-git-test-stress-test-vps-solc1us-projects.vercel.app`
- API: `https://resora-api-git-test-stress-test-vps-solc1us-projects.vercel.app`

**Database isolation has NOT been independently verified. No live run is authorized
by this implementation.** A Preview URL, passing offline tests, fixture metadata
and approval flags do not prove that the backend uses DEV. Before setting either
approval flag, PM/operator must independently verify and record privately:

1. Web `API_UPSTREAM_URL` routes to the API Preview above; browser tRPC uses the
   same-origin `/trpc` rewrite, not another configured `NEXT_PUBLIC_SERVER_URL`.
2. API runtime `DATABASE_URL` resolves to the intended isolated Supabase DEV project,
   with the exact non-secret project reference checked against deployment settings
   and an authorized read-only DB identity check. Do not infer DEV from the branch.
3. Web/API deployment revisions are compatible; record both immutable revisions
   and resolved deployment identities. Branch aliases may move between runs.
4. All 50 approved synthetic SR accounts exist, are active, have valid assignments,
   can authenticate and have no administrative privilege. Use the COMMITTED private
   export already described above; do not reset passwords or provision automatically.
5. Each run has a dedicated synthetic event: PUBLISHED, session ACTIVE, current
   nonrevoked QR, the approved synthetic accounts in its published invitation snapshot,
   and no attendance records initially. Do not use an existing operational event.
6. The supplied synthetic location is inside that session's configured geofence;
   accuracy is positive and <=40 m, with valid latitude/longitude ranges.
7. `AUTH_RATE_LIMIT_ENABLED=true` and existing pool/security settings are unchanged.
8. PM separately approves the attendance writes for the exact wave/event and the
   necessary manual fixture preparation. Web mode requires Deployment Protection
   to allow Web -> API forwarding. If that hop redirects to SSO, stop Web testing;
   explicit `api-direct` mode can test the verified isolated backend separately.

If any item is unknown, **STOP**, including before the first 2-VU run. This task did
not verify remote settings, accounts, QR state, GPS or DB identity.

### Verified request contract

Derived from `check-in-scanner.tsx`, `utils/trpc.ts`, `attendance.router.ts`,
`attendance.schema.ts`, `check-in.ts` and `qr.ts`, plus installed tRPC 11.19.0:

- Login POST `/api/auth/sign-in/username`, then POST
  `/trpc/attendance.checkIn?batch=1`, both through Web Preview by default, or both
  directly to the approved API Preview with `QR_TRANSPORT=api-direct`. Redirects
  remain disabled. Both transports retain `Origin: WEB_ORIGIN`.
- tRPC uses `httpBatchLink` with the default JSON transformer: body is
  `{"0":{"qrToken":"<private token>","location":{"latitude":0,"longitude":0,"accuracyMeters":1}}}`.
  The numbers here describe encoding only, **not an approved test location**.
  Send actual privately verified coordinates. Event/session IDs are not input fields.
- `Content-Type: application/json`, `Origin` exactly the Web origin. Server rejects
  cross-origin writes or a missing Origin. The per-VU cookie jar receives Better Auth's
  login cookie and sends it on the same-origin mutation; no bearer token is copied.
  The script requires a `better-auth.session_token` / `__Secure-` session cookie after
  HTTP 200; this is not a substitute for the backend's authoritative session checks.
- Success is HTTP 200 with a one-element batch array containing `result.data`:
  `status` CHECKED_IN or ALREADY_CHECKED_IN, `eventName`, ISO `attendanceAt`, and
  `timingClass` EARLY/ON_TIME/LATE. No SuperJSON `json` wrapper is configured.
- Errors use the batch `error` envelope (`message`, `data.code`, etc.) with tRPC HTTP
  status mapping. The script also detects an error envelope under HTTP 200. Non-JSON
  proxy errors, redirects and unexpected envelopes cannot count as successful writes.
- QR is `resora:v1:<session UUID>:<challenge UUID>:<64 lowercase hex signature>`.
  Its HMAC, current/revoked state and DB expiry are verified by the server. Expiry is
  **not encoded in the token**. The fixture's timestamps are operator-supplied metadata,
  not cryptographic proof. The script cannot verify signature/revocation offline.
- GPS schema checks finite coordinates, latitude [-90,90], longitude [-180,180],
  positive accuracy; business validation additionally requires accuracy <=40 m and
  Haversine distance <= the configured geofence radius. No camera/geolocation API runs.

### Manual preparation and private fixtures

After separate PM approval, an authorized operator uses existing event controls to
prepare **five independent equivalent events/sessions**, one for each 2/5/10/25/50-VU
wave. Invite only the 50 synthetic accounts explicitly (not an all-SR group that may
include real DEV identities). Keep roster, schedule policy, geofence, grace and QR
TTL equivalent. Publish and activate each event when ready; copy its current token
and server timestamps privately. All VUs within a wave use that ONE session/token.
Do not create these resources with the load script, reuse an old attendance-filled
session, delete attendance, or reset operational data. Any failed/ambiguous run needs
read-only reconciliation and a fresh approved fixture before retrying.

Keep `accounts.local.json` private as above. In this directory, manually create a
separate ignored `qr-fixture-2.local.json` (and corresponding 5/10/25/50 files).
Required fields, with actual values supplied privately by the operator:

| Field | Required value |
| --- | --- |
| `eventId` | Dedicated synthetic event UUID, for preflight bookkeeping only |
| `sessionId` | Its ACTIVE session UUID, matching the token |
| `qrToken` | Raw current signed token; never paste in commands or reports |
| `preparedForVus` | Number 2, 5, 10, 25 or 50, matching this wave |
| `activatedAt` | Challenge's actual server activation timestamp, ISO UTC |
| `expiresAt` | Actual server expiry, ISO UTC; >120 seconds remaining at setup |
| `location` | Object with numeric `latitude`, `longitude`, `accuracyMeters`, verified above |

Never invent IDs, tokens, timestamps or project references to pass the guard. The
script checks format, session binding, finite GPS and metadata expiry before HTTP;
it cannot prove that `eventId` and token bind to the same live event without the
independent preflight. It refuses an expired fixture before submission too. The
backend still rechecks eligibility, invitation and QR validity **after row-lock waits**.
Keep fixture permissions restricted to the operator; do not upload fixtures, k6
archives, raw response bodies, HARs or debug traces. Existing report paths are ignored.

### PowerShell: manual wave, only after the gate passes

From the repository root on the separate laptop:

```powershell
Set-Location tests/resora-loadtest
$env:WEB_ORIGIN = 'https://resora-git-test-stress-test-vps-solc1us-projects.vercel.app'
$env:TARGET_ORIGIN = $env:WEB_ORIGIN
$env:API_ORIGIN = 'https://resora-api-git-test-stress-test-vps-solc1us-projects.vercel.app'
$env:ACCOUNTS_FILE = './accounts.local.json'
$env:ACCOUNT_OFFSET = '0'
$env:VUS = '2'
$env:QR_TRANSPORT = 'web' # Default when absent.
$env:QR_FIXTURE_FILE = './qr-fixture-2.local.json'
# Only after independent preflight AND separate PM approval for this wave:
$env:APPROVE_ISOLATED_TARGET = 'yes'
$env:APPROVE_QR_CHECKIN_TEST = 'yes'
# If protected, load the existing approved Web bypass privately into
# VERCEL_WEB_BYPASS_SECRET. Never send the API bypass secret to Web.
New-Item -ItemType Directory -Force ./reports | Out-Null
$run = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
k6 run --summary-export "./reports/qr-$run-$($env:VUS)vu.json" ./qr-checkin.js
Remove-Item Env:APPROVE_QR_CHECKIN_TEST, Env:APPROVE_ISOLATED_TARGET
```

For **backend-only** testing when Web -> API rewrite is blocked by Vercel SSO,
use the same verified origins, account/QR fixture and wave settings above, without
running the Web test first. Keep `TARGET_ORIGIN = WEB_ORIGIN`; do not change Origin
to the API host. After the same isolation checks and separate wave approval:

```powershell
$env:QR_TRANSPORT = 'api-direct'
$qrApiBypass = Read-Host 'Existing approved API Preview automation bypass' -AsSecureString
$env:VERCEL_API_BYPASS_SECRET = [System.Net.NetworkCredential]::new('', $qrApiBypass).Password
Remove-Variable qrApiBypass
$env:APPROVE_ISOLATED_TARGET = 'yes'
$env:APPROVE_QR_CHECKIN_TEST = 'yes'
$run = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
try {
    k6 run --summary-export "./reports/qr-api-direct-$run-$($env:VUS)vu.json" ./qr-checkin.js
} finally {
    Remove-Item Env:VERCEL_API_BYPASS_SECRET, Env:QR_TRANSPORT, Env:APPROVE_QR_CHECKIN_TEST, Env:APPROVE_ISOLATED_TARGET
}
```

Direct mode requires a nonblank `VERCEL_API_BYPASS_SECRET`; there is no Web/generic
bypass fallback. Web mode never sends the API bypass; direct mode never sends the
Web/generic bypass. Each VU keeps its API-scoped login cookie for the API mutation.
Unknown transport values fail before HTTP. All existing target, fixture, VU, rate-limit
and no-retry gates remain in force. Label direct-mode reports as backend-only: they
do not validate the broken Web rewrite or end-to-end browser capacity.

The API must still accept the verified Web Origin and issue a session cookie usable
on the API host. If either fails, stop. In particular, an API configured to require
`AUTH_PROXY_SECRET` can return `UNTRUSTED_AUTH_PROXY` for direct login; report that
as BLOCKED for PM review, without adding proxy tokens, spoofing IPs, weakening guards
or changing deployment configuration. No live compatibility has been verified here.

Do not execute this block until the missing gate evidence and approval exist. For
each subsequent wave, manually change VUS and the matching **fresh** fixture path,
recheck deployment identity, then reapprove that run. Sequence: **2 -> 5 -> 10 -> 25 -> 50**,
never an automatic loop. Wait at least 65 seconds after each completed wave, with
no competing auth traffic. Stop escalation on any failed check/threshold, duplicate,
timeout or unexplained error. A public IP shared by all VUs still shares auth limits.
Do not disable the limiter, override scenarios/iterations, change the pool, or retry
an uncertain write. No preliminary login/session/dashboard request is added by the script.

### Metrics and interpretation

- `resora_qr_login_success` / `login_failed`: HTTP 200 plus session-cookie receipt,
  versus failure. A missing cookie is a login/proxy contract failure; check-in is not sent.
- `resora_qr_checked_in`: validated **new** CHECKED_IN only; must equal VUs.
  `resora_qr_already_checked_in` must be zero. Duplicates are valid server responses,
  but fail the new-write scenario and are not evidence of equivalent insert capacity.
- `resora_qr_login_ms`, `resora_qr_checkin_ms`: separate HTTP p50/p95/max, excluding
  connection setup. `resora_qr_journey_ms` measures login start through check-in receipt,
  including connections, excluding response assertion time; failed attempts are sampled.
- Per phase: `resora_qr_login_*` / `resora_qr_checkin_*` suffixes `429`, `4xx` (excluding
  429), `5xx`, `network_failures` and `timeouts`. Timeouts are a subset of network failures
  for k6 request/dial timeouts [1050/1211](https://grafana.com/docs/k6/latest/javascript-api/error-codes/).
  HTTP 504 is a 5xx gateway response, not proof of a client timeout or DB lock wait.
- `resora_qr_trpc_errors` counts batch application errors even under HTTP 200, with
  allowlisted `code` tags; `business_failures` uses only known fixed `reason` tags.
  QR_EXPIRED/REVOKED, NOT_INVITED, GPS_INACCURATE, etc. mean fixture/business validation
  failure, not successful load. UNAUTHORIZED means investigate cookie/session forwarding.
- `resora_qr_protocol_errors`: unexpected envelopes/HTML or missing success fields;
  correlate HTTP status first (a proxy HTML 503 is not necessarily a script bug).
  `fixture_expired` means no check-in was sent. `journey_failed` includes duplicates
  and every other failed new-write journey. Logs contain only phase/status/fixed outcome.
- Thresholds require all logins and new writes, no duplicates/failed journeys, all
  checks passing. There is no invented check-in latency SLA: report observed p50/p95/max
  alongside counts, HTTP codes and the fixed 15s login / 60s check-in request limits.
  After client/gateway timeout, the DB transaction may still commit: verify privately
  before any repeat. Never infer zero writes from a timeout alone.

This is backend HTTP testing with synthetic GPS, not mobile camera/GPS or browser
rendering performance. Login completion times may stagger check-in arrivals; it is
one concurrent user wave, not a synchronized barrier immediately before the mutation.

### Correlating Vercel / Supabase evidence (authorized DEV observation only)

Record UTC start/end, both revisions, fixture event/session IDs privately, VUs,
pool configuration and all result counters. In Vercel API logs, correlate LOGIN and
generic TRPC 5xx `AUTH_REQUEST_RESULT`: status, durationMs, poolTotal, poolIdle,
poolWaiting. Current opt-in diagnostics **do not log successful attendance.checkIn**,
do not expose its session-lookup timing, and do not name its individual procedure
in the fixed TRPC failure record. Use the bounded test window/platform request path
to correlate; do not claim exact attribution when other requests overlap. Web gateway
timeouts may not coincide with API completion. Pool snapshots at response finish
are not a continuous maximum or proof that the pool was free during the request.

In the verified DEV Supabase project's existing metrics/log tools, observe connections,
CPU, memory and DB timeout errors in the same window. An authorized operator may
use existing read-only SQL access to sample aggregate waits without exporting SQL,
IP addresses, identity data or QR tokens:

```sql
SELECT state, wait_event_type, wait_event, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database() AND backend_type = 'client backend'
GROUP BY state, wait_event_type, wait_event;

SELECT count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid)) > 0) AS blocked_connections
FROM pg_stat_activity
WHERE datname = current_database() AND backend_type = 'client backend';
```

These are operator procedures, **not executed by this implementation or k6**. Views
may be restricted by permissions and short lock waits can be missed. Do not grant
new privileges, enable logging/settings/extensions, or terminate sessions for testing.
High poolWaiting plus acquisition timeouts suggests connection queue pressure;
observed Lock waits/blockers suggest contention. `check-in.ts` takes event then
session FOR UPDATE locks, so this same-session test intentionally includes that
serialization. HTTP latency alone cannot separate pool acquisition, session lookup,
transaction time and lock wait. **Per-request transaction/lock durations are currently
unverified**; absent DB visibility is a reported limitation, not evidence of no locks.

Offline verification (no remote requests):

```powershell
# From repository root:
bun --no-env-file test tests/resora-loadtest/loadtest.test.ts
pnpm exec tsc --project tests/resora-loadtest/tsconfig.json --noEmit
```
