# ADR 0006 — enforced modular monolith

Status: Accepted direction by user request, 2026-11-06. Implementation and verification
are recorded separately in `docs/modular-refactor.md`. This supersedes earlier
technical folder examples, not business decisions in the PRDs.

## Decision

Keep the deployment, database, stack and existing business behavior. Backend domains
are Identity, Events, Committee, Attendance and Broadcast. Accounts and Provisioning
are internal Identity capabilities; Check-in is internal Attendance. No empty future
domain is scaffolded. Frontend remains a single Next.js application with feature-local
implementation, public browser/server entry points and routing composition.

Domain dependencies form a DAG: Broadcast/Committee/Events use Identity; Events may
read Committee; Attendance reads Events and Identity. Committee has no dependency on
Events: existing reusable committees are preserved. Application workflows compose
Events and Attendance without Events importing Attendance. Existing `attendance.*`
tRPC routes are compatibility transport, not ownership declarations.

Cross-domain imports use only `<domain>.public.ts` or `<domain>.contracts.ts`.
Public operations return data, not query builders, table objects, arbitrary SQL,
repositories or a generic CRUD facade. Input is operation-specific. Public server
operations are trusted internal contracts: application callers must enforce the
documented authorization gates, live rechecks and resource locks. Browser clients
cannot invoke them directly; tRPC retains input/session/password/permission gates.

An internal database/transaction handle may be passed to a public operation so the
owner can execute within the caller's transaction. It is not part of browser contracts
or a grant to query foreign tables. Only the owner imports its business tables.
Auth infrastructure owns provider tables; Identity supplies minimal display data to
other domains. The DB package composes schema/FKs centrally for Drizzle; SQL constraints
may reference another owner's table without granting application access to it.

Keep exactly-one-session triggers, foreign keys, migration hashes and physical table
names. No physical schema migration is needed for logical code ownership. Splitting
Events/Attendance does not make sessions optional or introduce new workflows.

Query composition must preserve order, pagination, missing-row semantics, and read
consistency. Reports that formerly used one SQL statement use one repeatable-read
transaction when composed, and bounded/batch reads rather than per-row lookups.
Global lock order remains Committee -> Event -> Session -> Identity. Never introduce
nested independent transactions in atomic workflows.

## Enforcement and tests

CI checks resolved relative/alias imports, public paths, module cycles, table ownership
and browser transitive imports. Temporary violations are exact file/target pairs,
removed as each phase migrates. Tests and central schema composition have explicit
roles; production application code has no blanket exception. Checker tests include
negative fixtures. Unit tests protect behavior; guarded local PostgreSQL suites are
needed to validate locks/triggers. Manual UAT and release remain separate gates.

## Consequences

Local calls stay simple. A later service extraction can replace an integration
contract, but distributed identity, transactions, consistency and delivery still
require design. This refactor does not claim network independence. External
participants, dynamic roster expansion, new event/session cardinalities and new
committee ownership rules are out of scope.
