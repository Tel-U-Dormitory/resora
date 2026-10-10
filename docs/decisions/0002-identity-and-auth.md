# ADR-0002: NIM-first SR authentication and actor separation

**Date:** 2026-10-10 | **Status:** Accepted business rules; Phase 2A foundation defined; full authentication pending

## Decision

Only SR accounts log in for NEED-001. User logs in with **NIM/password**, created through privileged provisioning/import, no public sign-up. Use Better Auth Username Plugin. Each account has exactly one primary actor. SR accounts have one department, one building and separate position/jabatan (`KADIV` is a position).

## Important nuance

An event audience is not an account role. `ALL_STUDENTS` includes SR and Mahasiswa while an account has only one primary actor. `KADIV` audience includes position=KADIV across all departments; only _department=HCO and position=KADIV_ grants manual attendance insertion/correction, requiring reason and audit.

## Security and unresolved work

Every SR has a real email. Authorized CSV import columns are NIM, name, email, department, position, building and active status; actual data is supplied privately before pilot UAT. Use synthetic accounts meanwhile. Securely generate/distribute initial passwords and enforce password change. No public self-registration or credential exposure.

Initial superadmin is a system privilege, not a fifth actor; initially only superadmin changes SR assignments and active status. Inactive accounts cannot authenticate/check in, regardless of participant snapshots or existing sessions. Backend checks privileges.

Plan Gmail SMTP, sender display name **RnD SR XIV**; sender address and SMTP credentials remain environment variables. Password recovery/email verification belong to Phase 2. Actual roster/dictionary values, secure credential delivery and SMTP operations remain TBD. Phase 2A enables the server Username Plugin, generates compatible username/display_username fields and defines six identity tables plus deferred SR/NIM constraints; Phase 2A.5 validated migrations locally; Phase 2A.6 applied and verified the unchanged chain on Supabase Development after explicit PM approval and safety preflight; see the [migration record](../modules/need-001/resora-need-001-data-model.md#15-phase-2a6-supabase-development-migration). Client/login/provisioning/enforcement remains future work; see the [canonical model review](../modules/need-001/resora-need-001-data-model.md#12-repository-compatibility-review-2026-10-10).


**Synchronization (2026-10-10):** updated in place for the explicitly confirmed Phase 1/pnpm and NEED-001 decisions; prior Bun package-manager/local-only DB assumptions and manual request/approval direction are superseded where applicable. Acceptance does not imply implementation.
