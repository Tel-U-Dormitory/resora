# Architecture / Product Decision Records

Records include `Accepted`, `Proposed`, and `Deferred` decisions. `Accepted` means the user/PM explicitly chose it, not that implementation has been shipped. Normally a future decision that changes a record adds a new ADR. This explicitly requested 2026-10-10 synchronization updates existing ADRs in place with dated supersession notes; Git history retains the prior text. Record review date, consequences, and open verification.

| ADR | Topic | Status |
|---|---|---|
| [0001](0001-stack-and-monorepo.md) | Stack, pnpm/Bun, Supabase, monorepo | Accepted direction |
| [0002](0002-identity-and-auth.md) | SR-only initial login, NIM/password, role model | Accepted; Phase 2A.5 locally validated; Phase 2A.6 applied/verified on Supabase Development |
| [0003](0003-event-qr-attendance.md) | Reusable event-bound QR and geofencing | Accepted business rules; schema/protocol Proposed |
| [0004](0004-pilot-scope-and-governance.md) | MVP NEED-001 and deadline | Accepted target with UAT requirements |
| [0005](0005-deployment-and-integrations.md) | VPS/Docker and deferred institutional integrations | Planned / Deferred |
