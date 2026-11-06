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
