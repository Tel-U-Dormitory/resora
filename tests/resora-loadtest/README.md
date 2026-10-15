# RESORA — controlled login/concurrency test

## Prerequisite (do not skip)

Test ONLY an explicitly approved environment with its own isolated test PostgreSQL database, and synthetic SR accounts. Verify Preview API `DATABASE_URL` points to the test database; verify Preview Web `API_UPSTREAM_URL` points to the Preview API. **A Preview URL is not proof of database isolation.** Never use Production credentials or copy Production data.

The application checks POST `Origin`. Set `WEB_ORIGIN` to the exact URL accepted by Preview API's `CORS_ORIGIN` and `BETTER_AUTH_URL`. `TARGET_ORIGIN` is either the Preview Web origin (exercises the rewrite) or the Preview API origin (direct). For a local direct setup, use target `http://localhost:3000` and web origin `http://localhost:3001`. To test Web rewrite locally, use target `http://localhost:3001` only if that rewrite is configured to the isolated local API.

## Windows PowerShell setup

```powershell
winget install k6 --source winget
# Open a new PowerShell if the command is not yet in PATH
k6 version
Copy-Item .\accounts.example.json .\accounts.local.json
# Edit accounts.local.json with DISTINCT synthetic accounts that exist in test DB.
New-Item -ItemType Directory -Force .\reports | Out-Null
```

Set the following in the PowerShell process running k6; replace origins with your actual isolated target:

```powershell
$env:TARGET_ORIGIN = 'http://localhost:3000'
$env:WEB_ORIGIN = 'http://localhost:3001'
$env:ACCOUNTS_FILE = './accounts.local.json'
$env:APPROVE_ISOLATED_TARGET = 'yes'  # ONLY after verifying isolation
$env:VUS = '2'
$env:ACCOUNT_OFFSET = '0'
k6 run --summary-export .\reports\smoke-2.json .\loadtest.js
```

For a protected Vercel Preview deployment, use `$env:VERCEL_BYPASS_SECRET` only if the target is configured for Vercel Automation Bypass. If Web and API are in different Vercel projects, each may need separate bypass handling. Never store or paste the secret in reports or Git. A 401/403 from Vercel protection is different from RESORA auth behavior.

## Test sequence

1. **Smoke, limiter ON:** 2 distinct synthetic users from one machine. Expected login 200 and valid identity session.
2. **Single-IP controlled concurrency, limiter OFF in the isolated Preview API only:** run VUS=5, then 10, then 25, optionally 50. Provide at least VUS unique synthetic accounts. Inspect `resora_login_200`, `resora_login_429`, `resora_login_5xx`, `resora_session_valid`, `resora_session_5xx`, p95 `resora_login_ms`/`resora_session_ms` and Vercel `AUTH_REQUEST_RESULT` / poolWaiting. Stop if 5xx occurs and assess before increasing load.
3. **Limiter ON multi-IP probe:** wait >60s after the prior login tests, then coordinate 3 logins from machine/network A (account offset 0) and 3 from machine/network B (account offset 3) within the same minute. Confirm that the machines actually have *different egress public IPs* privately (e.g., `curl.exe https://api.ipify.org`). Keep other login traffic at zero. If a network gets 429 before its own 75th attempt, investigate proxy bucket sharing. Repeat through Web and direct API independently after separate limiter windows. A 3+3 run is now only a smoke check: it cannot prove bucket separation under the 75-request limit. Verify ingress preservation/spoof rejection separately before interpreting multi-IP results. Never spoof `X-Forwarded-For`.
4. **A/B with same load:** same test target, code revision, region, fixtures, measured VUS, and account set. Toggle `AUTH_RATE_LIMIT_ENABLED=true/false` on isolated Preview API and redeploy; compare 429 and 5xx separately. Restore ON afterward and redeploy.

For multi-IP networks: use `$env:VUS='3'; $env:ACCOUNT_OFFSET='0'` on A and `$env:VUS='3'; $env:ACCOUNT_OFFSET='3'` on B, coordinating the start. All runners must have identical fixture accounts. This script uses one login and one identity.session request per VU, no retry. Run only with the service owner's permission, within a controlled test window.

## Notes

- `VUS=50` from one machine is **not 50 IP addresses**. When limiter is ON the shared IP/path bucket is limited to 75 login requests / 60s (or may be shared by proxying).
- k6's `resora_session_valid` verifies an authenticated identity response; 200 with `null` identity is not a pass.
- This is HTTP-level testing; it does not simulate browser rendering, SSR redirects, or automatic route transitions. It models the two primary backend requests seen in the RESORA login form.
- Different load-generator origins verify buckets only when the actual egress public IPs differ, not merely because the username differs.
- Report files include timing/host-level metadata. Keep them private and do not commit test credentials.
- A 5xx may arise from pool checkout timeout, pooler, or infrastructure; numeric pool metrics are point-in-time only. Do not interpret 0/1 connection counts as definitive diagnosis of Supavisor.
