# Modular maintainability follow-up — 2026-11-06

Scope: improve the existing modular monolith on the current branch, local commits
only. Approved business behavior, tRPC contracts, transaction/lock order and physical
database schema remain unchanged. No push, deployment or remote migration.

| Phase | Scope | Verification gate |
| --- | --- | --- |
| 1 | Explicit domain DTOs and owner-enforced mutation invariants | Negative command tests, existing workflow tests, types and boundaries |
| 2 | Backend use-case/capability grouping and thin composition entry | Workflow regression, types and boundary checks |
| 3 | Frontend capability folders and decomposed Event UI | Existing JSX/callback tests, types, boundaries and build |
| 4 | Module-local integration suites and shared large fixtures | Test discovery, all offline tests and guarded local PostgreSQL integration |
| 5 | Current architecture, ownership and developer instructions | Full CLI checks/builds, documentation/path audit, clean local commits |

Unit tests stay beside the behavior when small. Cross-domain workflow tests belong
to application tests; integration tests belong in module-local tests/integration.
Fixtures live next to their test capability and are not production public APIs.
Small coherent domains remain shallow. No mandatory technical-layer folders.

Baseline: 449 offline tests passed, 0 failed (56 files). Results per phase follow.

## Phase 1 result

Event/Invitation/Session facts and audit inputs are explicit types rather than ORM
inference. Mutation helpers no longer return unused driver metadata. Draft deletion
checks its owner state/evidence, and session activation locks/revalidates its owner
state. Authorization and cross-domain atomicity remain application responsibilities.
Verification: 71 existing workflow tests plus 2 negative command tests passed; API
typecheck and architecture checks passed. No SQL/migration or business-rule changes.

## Phase 2 result

Replaced the 820-line application implementation with six cohesive workflow files
and one explicit entry. Event queries, commands and invitation operations are
separate; Attendance session queries/commands have a capability folder. Pure roster
comparison/visibility policy lives in Events. Public fact reads use explicit column
projections so later schema additions do not silently become DTO fields.
Verification: 64 workflow/command/audit tests passed, API types and boundaries passed.

## Phase 3 result

Identity UI is grouped into auth, accounts, permissions, periods, profile and server
capabilities behind its existing public/server entries. Event form/detail now compose
focused model, roster, schedule, session, invitation and administration components.
No route, tRPC contract or user workflow changed. Existing source/callback tests
follow the composed components rather than relying on one monolithic source file.
Verification: 113 frontend tests passed; web typecheck, boundary checks and production
Next.js build passed. Manual browser/UAT was not requested or performed.

## Phase 4 result

All API integration suites are under their owning capability's tests/integration;
cross-domain Event/Attendance workflow suites are under application/internal-events/tests.
The large Event workflow and Attendance reporting doubles live in adjacent fixtures.
Mixed frontend workflow tests live in src/tests/workflows. Small unit tests remain
colocated. Architecture checks exempt test support from production ownership rules
and explicitly reject production imports of test support (negative fixtures included).
Root script paths and migration-path resolution follow the moved files.
Verification: 452 offline tests passed (58 files); API/web types and boundary checks
passed. Six guarded PostgreSQL suites passed 81 tests / 732 assertions against an
isolated loopback-only PostgreSQL 17 container with synthetic data. Other opt-in
integration suites were relocated and typechecked, but not executed in this follow-up.
