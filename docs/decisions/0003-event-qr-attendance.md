# ADR-0003: Event-scoped reusable QR challenge with location and manual review

**Date:** 2026-10-10 | **Status:** Accepted intent; token protocol Proposed

## Decision

HCO creates event and QR together. Event configuration has target audience `SR`, `KADIV`, or `ALL_STUDENTS`; geographic center/radius default **20 m** configurable; late tolerance default **15 min** configurable. QR primitives should be reusable by NEED-007; attendance workflow is separate domain logic. If location is denied/unreliable, the SR may submit a manual request that KADIV HCO approves/rejects. KADIV HCO exclusively corrects attendance.

## Proposed technical choices (not HCO-approved rules)

Opaque short-lived event-bound nonce, revocation/rotation, server-side verification, atomic unique `(eventId,userId)` attendance records, manual state machine and immutable audit. Do not count pending requests as attendance. Do not presume GPS proves presence.

## Open policy

QR TTL; allowed location radius min/max and accuracy; default coordinates; early scan/late/after-end window; manual evidence/approval semantics; eligibility snapshot vs live.
