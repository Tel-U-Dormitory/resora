---
name: "playwright"
description: "Automate browser interaction, screenshots, and UI flow debugging when the user explicitly requests browser-based verification. For RESORA, follow AGENTS.md; ordinary frontend changes use CLI verification by default."
---

## RESORA integration

Do not launch a browser, take screenshots, or run visual checks without an explicit user request, as required by AGENTS.md. Installation of this skill is not that request. Inspect the wrapper before running it; it can download a CLI via npx. Browser/package downloads and external interactions remain subject to execution permissions. Use local synthetic accounts and data; installation does not authorize real-user changes. Persistent E2E specs need the appropriate configured runner; the CLI wrapper alone is not an E2E test suite.



# Playwright CLI Skill

Drive a real browser from the terminal using `playwright-cli`. Prefer the bundled wrapper script so the CLI works even when it is not globally installed.
Treat this skill as CLI-first browser verification. Persistent E2E test files require a configured runner and authorization for any dependency additions. Follow AGENTS.md for verification requirements.

## Prerequisite check (required)

Before proposing commands, check whether `npx` is available (the wrapper depends on it):

```bash
command -v npx >/dev/null 2>&1
```

If npx is unavailable, report the prerequisite and continue independent work.
Do not install global packages automatically. A global Playwright CLI install is optional;
the local wrapper uses npx and may require network access and an available browser.

## Skill path (set once)

```bash
export PWCLI="<absolute-path-to-this-skill>/scripts/playwright_cli.sh"
```

Replace `<absolute-path-to-this-skill>` with the actual directory containing this SKILL.md under `.agent/skills` or `.codex/skills`. Run from the repository root. This repository bundles the wrapper locally; do not assume a user-global skill installation. Use `bash "$PWCLI"` if the executable bit is unavailable.

## Quick start

Use the wrapper script:

```bash
"$PWCLI" open https://playwright.dev --headed
"$PWCLI" snapshot
"$PWCLI" click e15
"$PWCLI" type "Playwright"
"$PWCLI" press Enter
"$PWCLI" screenshot
```

If the user prefers a global install, this is also valid:

```bash
npm install -g @playwright/cli@latest
playwright-cli --help
```

## Core workflow

1. Open the page.
2. Snapshot to get stable element refs.
3. Interact using refs from the latest snapshot.
4. Re-snapshot after navigation or significant DOM changes.
5. Capture artifacts (screenshot, pdf, traces) when useful.

Minimal loop:

```bash
"$PWCLI" open https://example.com
"$PWCLI" snapshot
"$PWCLI" click e3
"$PWCLI" snapshot
```

## When to snapshot again

Snapshot again after:

- navigation
- clicking elements that change the UI substantially
- opening/closing modals or menus
- tab switches

Refs can go stale. When a command fails due to a missing ref, snapshot again.

## Recommended patterns

### Form fill and submit

```bash
"$PWCLI" open https://example.com/form
"$PWCLI" snapshot
"$PWCLI" fill e1 "user@example.com"
"$PWCLI" fill e2 "password123"
"$PWCLI" click e3
"$PWCLI" snapshot
```

### Debug a UI flow with traces

```bash
"$PWCLI" open https://example.com --headed
"$PWCLI" tracing-start
# ...interactions...
"$PWCLI" tracing-stop
```

### Multi-tab work

```bash
"$PWCLI" tab-new https://example.com
"$PWCLI" tab-list
"$PWCLI" tab-select 0
"$PWCLI" snapshot
```

## Wrapper script

The wrapper script uses `npx --package @playwright/cli playwright-cli` so the CLI can run without a global install:

```bash
"$PWCLI" --help
```

Prefer the wrapper unless the repository already standardizes on a global install.

## References

Open only what you need:

- CLI command reference: `references/cli.md`
- Practical workflows and troubleshooting: `references/workflows.md`

## Guardrails

- Always snapshot before referencing element ids like `e12`.
- Re-snapshot when refs seem stale.
- Prefer explicit commands over `eval` and `run-code` unless needed.
- When you do not have a fresh snapshot, use placeholder refs like `eX` and say why; do not bypass refs with `run-code`.
- Use `--headed` when a visual check will help.
- When capturing artifacts in this repo, use `output/playwright/` and avoid introducing new top-level artifact folders.
- Default to CLI commands and workflows, not Playwright test specs.
