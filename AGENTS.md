# AGENTS.md — RESORA

> Repository-wide instructions for coding agents. This file defines **how to work**, not **what product behavior to build**. Keep it stable across features, releases, and implementation phases.

## 1. Sources of truth

Read only the documents relevant to the task, then inspect the actual code and configuration before editing.

| Source                                    | Authority                                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `docs/prd.md`                             | Product goals, scope, business rules, and approval boundaries                                |
| `docs/modules/`                           | Module-specific requirements, workflows, and acceptance criteria                             |
| `docs/architecture.md`                    | Technical architecture, code organization, integration boundaries, and engineering standards |
| `docs/decisions/`                         | Architecture decisions and their rationale; check each decision's status                     |
| `docs/setup.md` and repository manifests  | Available commands, environment setup, and tooling                                           |
| Source code, tests, and migration history | Evidence of what is actually implemented and verified                                        |

- Follow the latest **explicitly approved** requirements. Do not treat a proposal, old roadmap, existing implementation, or passing test as approval of business behavior.
- A new request may change the intended scope, but do not silently resolve conflicts with existing approved requirements. Identify the conflict and ask for a decision before implementing the affected behavior.
- Never invent unspecified permissions, eligibility rules, data semantics, or workflow transitions. Mark unresolved details as **TBD** and isolate work that depends on them.
- Keep business requirements and volatile identifiers in the PRD; technical design in Architecture/ADRs; execution progress in task or project tracking. **Do not copy them into this file.**

## 2. Working principles

1. **Understand before changing.** Inspect the relevant implementation, tests, and working-tree changes. Preserve user changes and avoid overwriting unrelated work.
2. **Make the smallest cohesive change.** Stay within the requested scope. Avoid opportunistic refactors, new dependencies, scaffolding, or speculative features.
3. **Follow existing conventions.** Match the actual repository and the current Architecture. Prefer simple, readable, type-safe code over abstraction for its own sake.
4. **Organize by capability where appropriate.** Keep related code close together. Do not introduce unnecessary nesting or directories that merely wrap a single file. Create abstractions or shared modules only when genuine reuse or complexity justifies them.
5. **Separate responsibilities without ceremony.** Keep transport/UI boundaries thin, business rules testable, and data access explicit. Do not create pass-through layers just to satisfy a pattern.
6. **Respect module boundaries.** Avoid circular dependencies, hidden cross-module coupling, duplicate business rules, and direct access to another module's private implementation.
7. **Update relevant documentation and tests** when behavior, interfaces, configuration, or architecture changes. Do not rewrite unrelated documents.

## 3. Security and data integrity

- Treat authentication, authorization, ownership, input validation, and sensitive-data access as **server-enforced** concerns. Client-side visibility is not a security boundary.
- Validate untrusted inputs at appropriate boundaries. Consider failure paths, retries, concurrency, and data consistency when the affected workflow requires them.
- Do not leak or commit secrets, credentials, private datasets, tokens, connection strings, or sensitive logs. Use approved environment mechanisms and synthetic fixtures for development.
- Use parameterized database access and reviewed schema changes. Do not alter previously applied migrations or assume that a development database is disposable.
- **Require explicit authorization** before deployments, remote database mutations/migrations, destructive operations, bulk imports, real-user account changes, or actions affecting external systems.
- If execution permission is denied, do not bypass the restriction or silently try a different privileged route. Re-request permission when supported; otherwise explain the blocker.

## 4. Verification and quality gates

- **Default to command-line verification:** focused unit/integration tests, typecheck, relevant lint, and build as appropriate to the change.
- Do **not** launch Chromium, browser automation, computer-use, screenshots, or visual UI testing unless the user explicitly requests them. CLI verification is not a substitute for separately required manual UAT or release sign-off.
- Inspect scripts and flags before running commands; distinguish read-only checks from tools that automatically format, modify, migrate, seed, or deploy.
- Use local or otherwise explicitly approved test environments and synthetic data. Never run destructive validation against a remote environment by default.
- Test relevant positive and negative paths, especially security, authorization, state transitions, and transactional integrity when touched.
- A passing build is not proof that the feature works. Report unexecuted tests and unverified behavior honestly.
- If a repository-wide check fails for pre-existing, unrelated issues, isolate the failure, verify changed files where feasible, and report the baseline rather than expanding scope without approval.

## 5. Efficient agent workflow

1. **Inspect selectively.** Read task-relevant sections and files; avoid repeated full-document or repository dumps without a reason.
2. **Plan briefly.** State intended changes, assumptions, dependencies, and any permission or decision gates for nontrivial work.
3. **Implement incrementally.** Make focused changes and add or adjust tests for the affected behavior.
4. **Verify purposefully.** Run commands relevant to the latest changes; do not rerun successful expensive checks without an intervening reason.
5. **Keep output concise.** Show summaries and actionable errors, not long successful build logs or entire file contents.
6. **Use external research only when needed.** Prefer repository documentation and local evidence; consult external references for genuine unknowns or version-sensitive blockers.
7. **Stop at approval gates.** Do not infer approval from access to credentials, tools, or environments.

## 6. Completion report

Conclude with a short, evidence-based report containing:

- **Implemented:** the behavior changed and key paths touched.
- **Verified:** commands run and their actual results.
- **Not verified:** skipped checks, test limitations, or manual UAT still required.
- **Impact:** changes to configuration, dependencies, schema, data, or environments; explicitly state when none occurred.
- **Open items:** conflicts, blockers, risks, and next recommended action.

Use precise status language: **proposed**, **implemented**, **tested**, and **released** are different states. Never claim a task or phase is complete when its required acceptance criteria have not been demonstrated.
