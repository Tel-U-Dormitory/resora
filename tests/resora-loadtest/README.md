# RESORA - Isolated authentication load test and VPS public smoke

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
`VERCEL_API_BYPASS_SECRET` is reserved for read-only API preflight, not sent to Web.
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

Offline verification (no remote requests):

```powershell
# From repository root:
bun --no-env-file test tests/resora-loadtest/loadtest.test.ts
pnpm exec tsc --project tests/resora-loadtest/tsconfig.json --noEmit
```
