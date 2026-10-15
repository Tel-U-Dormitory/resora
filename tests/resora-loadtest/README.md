# RESORA - Preview login-to-dashboard HTTP validation

## Safety gate

Use only an explicitly verified Preview Web -> Preview API -> isolated DEV database
and the approved synthetic roster `sr-loadtest-50.csv`. A Preview hostname and
`APPROVE_ISOLATED_TARGET=yes` are operator assertions, not proof of DB isolation.
Before each series, verify Web/API code revision, Web `API_UPSTREAM_URL`, API
`DATABASE_URL` DEV project reference and `AUTH_RATE_LIMIT_ENABLED=true`.
Do not use Production accounts/traffic or change rate limits, pool settings or deployments.

`TARGET_ORIGIN` and `WEB_ORIGIN` must be the same HTTPS Preview Web origin,
without a path/trailing slash. Direct API testing is not this journey. The known
Production Web origin is refused. This guard cannot identify every Production alias;
independent target verification is mandatory. Missing approval stops before HTTP.

Use the existing private `accounts.local.json` generated from a COMMITTED synthetic
credential export (see SETUP-ACCOUNTS.md); never copy placeholder credentials or
reset existing accounts. Every selected username must match the approved load-test
prefix/range, have a nonblank password and be unique within the run. No credentials
are printed. Do not enable HTTP debug/body logging, k6 cloud uploads or `k6 archive`
(the latter embeds fixtures). Reports and credential files remain Git-ignored.

## HTTP journey and acceptance

Each VU performs exactly one POST `/api/auth/sign-in/username`, then GET `/dashboard`
through Preview Web. The existing per-VU k6 cookie jar carries the login cookie.
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

## Execution after verification

From `tests/resora-loadtest`, set the confirmed public origins and local fixture path:

```powershell
$env:TARGET_ORIGIN = '<verified Preview Web HTTPS origin>'
$env:WEB_ORIGIN = $env:TARGET_ORIGIN
$env:ACCOUNTS_FILE = './accounts.local.json'
$env:APPROVE_ISOLATED_TARGET = 'yes' # Only after independently verifying every hop and limiter ON.
$env:ACCOUNT_OFFSET = '0'
$env:VUS = '2'
k6 inspect -e "VUS=$env:VUS" --execution-requirements ./loadtest.js # Local compilation only; no HTTP.
k6 run -e "VUS=$env:VUS" --summary-export ./reports/phase4-2.json ./loadtest.js
```

Run 2, 5, 10, then 20 VUs **manually, one run at a time**, with at least 65 seconds
after each completed run and no competing login traffic. Change VUS/report filename
together; stop on any failed check, threshold, unexplained HTTP failure or timeout.
Do not automatically escalate after failure or switch the limiter OFF. Earlier
API-only/limiter-OFF experiments are historical and do not apply to this phase.

Protected Preview requires an existing, approved automation bypass. Load its value
privately into `VERCEL_WEB_BYPASS_SECRET` (`VERCEL_BYPASS_SECRET` remains a fallback); never put the value in commands/reports/Git.
`VERCEL_API_BYPASS_SECRET` is reserved for read-only API preflight, not sent to Web.
Web/API are different projects: verify bypass forwarding works for both; do not
create bypasses or disable deployment protection merely to run this test. A 302 to
vercel.com or an authentication-protection page is a blocker, not an application result.

Record UTC run windows, both deployment revisions, VUs, all p50/p95/counters and
threshold status. Correlate with Preview API `AUTH_REQUEST_RESULT` (LOGIN,
IDENTITY_SESSION; DASHBOARD_DATA is no longer expected after Phase 3), poolWaiting
and HTTP 5xx within that same window if Vercel log access is available. Do not export
raw runtime messages containing secrets or identity data. Shared HTTP batch timing
is not per-resolver timing; pool snapshots are not peak utilization.


Offline verification (no remote requests):

```powershell
# From repository root:
bun --no-env-file test tests/resora-loadtest/loadtest.test.ts
pnpm exec tsc --project tests/resora-loadtest/tsconfig.json --noEmit
```
