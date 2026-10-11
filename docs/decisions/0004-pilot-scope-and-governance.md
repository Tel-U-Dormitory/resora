# ADR-0004: Module-based MVP; 18 October SR pilot

**Date:** 2026-10-10 | **Status:** Accepted target, incomplete policy sign-off

## Decision

MVP is defined **per NEED**, not a single release of all RESORA modules. First priority NEED-001 SR internal event attendance, targeted for **usable SR release on 2026-10-18**. NEED-007 (resident activities) and NEED-005 (SR evaluation) follow in parallel by end October 2026, with their MVPs not yet defined. PM determines priority and final sign-off; business rules for relevant stakeholders need their validation, particularly non-SR scope.

## Consequence

Shipping a QR page alone does not satisfy MVP. Must validate full pilot journey, actual SR authentication, HCO event/recap, KADEP audited manual insertion/correction, publication snapshots and exports including non-attendees, privacy/security and UAT. Phase 1/pnpm infrastructure completion does not satisfy these gates. Students outside SR are not in initial login scope, even if future events may target `ALL_STUDENTS`.

**Phase 3 PM update (2026-10-11):** active jabatan/audience terminology uses KADEP, replacing KADIV without an input alias or automatic legacy conversion. See [canonical organization/policy baseline](../modules/need-001/resora-need-001-data-model.md#8-server-side-authorization-phase-3). Event/attendance implementation and reconciliation with the current roster/session PRD remain later work.
