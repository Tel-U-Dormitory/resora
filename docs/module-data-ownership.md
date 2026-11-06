# Data ownership

Physical tables, foreign keys, custom triggers and historical migrations remain
unchanged by ADR 0006. Logical ownership does not require a table/schema rename.
`packages/db` is the central Drizzle schema/migration composition root, not a
public data API for domain consumers.

| Owner | Tables / capabilities |
| --- | --- |
| Identity | user_profiles, sr_profiles, departments, positions, buildings, sr_periods, sr_period_memberships, system_privileges, user_permission_grants, account audit; Accounts/Provisioning are internal |
| Auth provider (Identity infrastructure) | user, account, session, verification, password recovery and provider rate limits |
| Events | events, event_participants, event_audit_logs, event_deletion_audits |
| Attendance | attendance_sessions, qr_challenges, attendance_records, attendance_audit_logs |
| Committee | committees, committee_divisions, committee_members |
| Broadcast | broadcasts |

Identity supplies minimal display names for cross-domain audit/Broadcast composition.
An existing foreign key is not permission for a consumer to query the referenced
table. Public operations accept an internal transaction and return materialized
DTOs; schemas/table objects and arbitrary query predicates are not public contracts.

No physical migration/backfill is required for this refactor. Preserve exactly-one
session and immutable-binding triggers, append-only audits and original-record
integrity. Historical migration SQL is never edited. Any future schema change must
be additive first, verify data and compatibility, and have its own reviewed rollout.
Remote execution remains separately authorized.
