# Modular monolith refactor — execution record

Date: 2026-11-06. Scope authorized in the refactor chat: all phases, local commits
on `refactor/architecture-modular-monolith`; no push, deployment or remote migration.

## Phase 0 — baseline and constraints

The starting implementation has Identity (including Accounts/Provisioning),
internal Events, Committee, Attendance (including Check-in/Reporting), and Broadcast.
The folders are not yet enforceable module boundaries. API wildcard exports expose
private files; frontend imports backend helpers. Broadcast and audit reporting join
Auth's user table. Event workflows query both Event and Attendance persistence.

Business baseline to preserve:

- Existing tRPC namespaces, schemas, DTOs, errors, permissions and routes.
- Exactly one attendance session per internal event, enforced by the deferred
  `check_internal_event_session` trigger. Creation/deletion and closure stay atomic.
- Committee can be reused by events; committee titles do not grant system access.
- Invitation snapshots, including the existing restricted SUPERADMIN advanced-edit
  exception. No automatic synchronization, external participant flow or new session model.
- Live permission checks and lock order: Committee (when needed), Event, Session,
  Identity, then attendance record/grant locks as required by the existing operation.
- Repeatable-read report snapshots, duplicate-safe QR insertion, immutable original
  attendance fields and append-only audits.

Historical PRD phase sections are not new approvals. Later explicit permission and
advanced-edit decisions continue to apply. Existing business ambiguities are not
resolved by this structural refactor.

Initial test attempt: 416 passed, 6 failed due to sandbox loopback restrictions and
Node absent from PATH. Verified repeat with bundled Node and permitted loopback: **442 pass, 0 fail**
across 54 files (`bun --no-env-file scripts/test-offline.ts`). Integration suites require
separately guarded local PostgreSQL; offline doubles do not prove SQL lock scheduling.

## Phase sequence

0. Inspect and record baseline.
1. Accept technical design while freezing business behavior.
2. Add executable boundary checks and regression protection.
3. Establish schema ownership without changing physical SQL or migration history.
4. Pilot Broadcast and Identity display-name contracts.
5. Consolidate Identity submodules and public operations.
6. Separate Event/Committee ownership and application orchestration.
7. Route Attendance through owned Event contracts; preserve transactions/reports.
8. Enforce frontend exports, close exceptions, verify and update documentation.

Each phase runs unit tests before its local commit and the next phase. Verification
results and any remaining limits are recorded below; implementation is not release.

## Phase 1 — accepted technical design

ADR 0006 defines five domains, trusted server contracts, browser contracts,
application coordination and unchanged physical database constraints. Focused
baseline: 71 tests passed (Event editing, Check-in, Reporting), 0 failed.

## Phase 2 — boundary guard

Added TypeScript-AST import checks, browser dependency traversal, domain table
ownership checks, negative fixtures, and CI invocation. Initial 28 exact transitional
exceptions must shrink to zero. Unit verification: 27 passed, 0 failed.
