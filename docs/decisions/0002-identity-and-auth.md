# ADR-0002: NIM-first SR authentication and actor separation

**Date:** 2026-10-10 | **Status:** Accepted identity rules; Phase 2B auth and Phase 2C synthetic provisioning tested locally; real import/recovery/UAT pending

## Decision

Only SR accounts log in for NEED-001. User logs in with **NIM/password**, created through privileged provisioning/import, no public sign-up. Use Better Auth Username Plugin. Each account has exactly one primary actor. SR accounts have one department, one building and separate position/jabatan (`KADEP` is a position).

## Important nuance

An event audience is not an account role. NEED-001 uses a composable active-SR roster (all SR, departments, all KADEP across departments, individuals, include/exclude and deduplication), not a single audience enum; Inti mapping remains TBD. General-activity eligibility later comes from active Activity registration. Only _department=HCO and position=KADEP_ grants internal manual attendance insertion/correction, requiring reason and audit. Active Adaptif operators govern general activity attendance without a KADEP requirement; SUPERADMIN does not bypass either operational policy.

## Security and unresolved work

Every SR has a real email. Authorized CSV import columns are NIM, name, email, department, position, building and active status; actual data is supplied privately before pilot UAT. Use synthetic accounts meanwhile. Securely generate/distribute initial passwords and enforce password change. No public self-registration or credential exposure.

Initial superadmin is a system privilege, not a fifth actor; initially only superadmin changes SR assignments and active status. Inactive accounts cannot authenticate/check in, regardless of participant snapshots or existing sessions. Backend checks privileges.

Plan Gmail SMTP, sender display name **RnD SR XIV**; sender address and SMTP credentials remain environment variables. Password recovery/email verification belong to Phase 2. Actual roster, secure credential delivery and SMTP operations remain TBD. Phase 2A enables the server Username Plugin, generates compatible username/display_username fields and defines six identity tables plus deferred SR/NIM constraints; Phase 2A.5 validated migrations locally; Phase 2A.6 applied and verified the unchanged chain on Supabase Development after explicit PM approval and safety preflight; see the [migration record](../modules/need-001/resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration). Phase 2B implements SR-only active-account login/session enforcement, backend signup denial, frontend login/logout and mandatory first-password-change using existing schema; see the [implementation evidence](../modules/need-001/resora-need-001-data-model.md#16-phase-2b-sr-authentication). Real import/distribution and recovery remain future work; local synthetic provisioning is implemented in Phase 2C below.

**Phase 2B security:** keep NIM as a string; verify actor/active/SR profile from current DB state on each protected request, even with an old session. Require trusted origins for auth mutations and use framework throttling with a server-controlled socket IP. Password change must differ from the current password, be verified by Better Auth, revoke old sessions and only then release the gate. No new migration or Supabase writes are needed. A future authorized provisioner must use an explicitly privileged server/script path and set the first-change flag; public signup must remain disabled.

**Phase 2C implementation (2026-10-11):** the internal local-scratch CSV CLI uses transaction-bound Better Auth creation/hashing plus complete SR profiles with the first-change flag. It supports read-only dry-run, explicit apply, exact-reimport skip and conflict rejection. One private credential CSV is fsynced before DB writes; failure rolls back and uncertain outcomes retain recovery evidence. No public endpoint, schema change, remote import or SMTP was added. See [implementation/tests](../modules/need-001/resora-need-001-data-model.md#17-phase-2c-sr-csv-provisioning) and [operator instructions](../setup.md#phase-2c-internal-csv-provisioning-local-synthetic-imports-only). Actual roster distribution and recovery remain future work.

**Out-of-scope documentation discrepancy (2026-10-11):** audience/event wording in this ADR, roadmap, acceptance scenarios and proposed domain model predates the latest SR-only participant-builder/session-based PRDs and architecture. Identity rules agree. Reconcile the affected domain documents with PM before event/attendance implementation; Phase 2B does not implement or choose between those older domain designs.


**Synchronization (2026-10-10):** updated in place for the explicitly confirmed Phase 1/pnpm and NEED-001 decisions; prior Bun package-manager/local-only DB assumptions and manual request/approval direction are superseded where applicable. Acceptance does not imply implementation.

## Phase 3 approved update — 2026-10-11

PM approved **KADEP replacing KADIV** in new inputs and active policies; no alias or automatic legacy data conversion. [Canonical dictionaries and relations](../modules/need-001/resora-need-001-data-model.md#42-departments-positions-buildings--canonical-organization-dictionaries) define 7 departments, 7 independent positions and 18 TEXT-coded buildings. Inti mapping remains TBD.

Live DB identity and [simple policies](../modules/need-001/resora-need-001-data-model.md#8-server-side-authorization-phase-3) are implemented/tested locally: HCO internal operations, HCO + KADEP manual correction, ADAPTIF general operations/manual without KADEP, explicit SUPERADMIN identity administration only. No extra operator role, operational admin bypass, endpoint or schema migration is introduced. Existing auth/password/provisioning behavior is retained.

**Documentation synchronization (2026-10-11, after Phase 3):** active roster/session references are now aligned with the current PRD and [canonical model](../modules/need-001/resora-need-001-data-model.md). The earlier dated discrepancy note records the Phase 2B audit state. Cross-module event/session binding and unresolved lifecycle/policy decisions still block dependent Phase 4 implementation; no code/schema change is made here.
