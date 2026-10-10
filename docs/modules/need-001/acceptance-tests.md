# NEED-001 — Acceptance Criteria & UAT Scenarios

**Status:** Draft tests, awaiting PM/HCO agreement where marked `TBD`.

| ID     | Scenario / Given                                                 | When                                                            | Expected outcome                                                   | Decision state                                        |
| ------ | ---------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| AT-001 | Imported active SR with valid NIM/password                       | Log in                                                          | Authenticated with one SR primary actor, no registration link/path | Confirmed                                             |
| AT-002 | Unprovisioned NIM                                                | Attempt login                                                   | Generic error; no user enumeration and no automatic registration   | Confirmed                                             |
| AT-003 | SR in department HCO                                             | Create attendance event with audience SR, radius 20m, grace 15m | Event saved; HCO can display event QR                              | Confirmed fields                                      |
| AT-004 | Ordinary SR not in HCO                                           | Try create event/issue QR/export via direct tRPC request        | Server refuses, regardless of UI                                   | Confirmed                                             |
| AT-005 | KADIV of Adaptif (not HCO)                                       | Attempt to approve manual attendance                            | Server rejects                                                     | Confirmed                                             |
| AT-006 | KADIV HCO                                                        | Approve valid pending request                                   | Record inserted/updated exactly once; decision audited             | Confirmed principle; final class policy TBD           |
| AT-007 | Member HCO who is not KADIV                                      | Attempt correction/approval                                     | Server rejects                                                     | Confirmed                                             |
| AT-008 | SR event                                                         | Match event audience `SR`                                       | Can see/check in when all other conditions valid                   | Confirmed                                             |
| AT-009 | KADIV event                                                      | SR `position=KADIV`, any department                             | Eligible                                                           | Confirmed                                             |
| AT-010 | KADIV event                                                      | SR ordinary member                                              | Ineligible, cannot bypass with forged request                      | Confirmed                                             |
| AT-011 | ALL_STUDENTS event                                               | Authenticated SR                                                | Included by audience rule despite only one actor                   | Confirmed                                             |
| AT-012 | ALL_STUDENTS event                                               | Non-SR student during pilot                                     | No login / cannot check in until student actor implemented         | Explicit MVP limitation                               |
| AT-013 | Valid event QR, eligible SR, inside geo and active window        | Scan                                                            | One attendance record and own-history entry                        | Window boundaries TBD                                 |
| AT-014 | Same user scans same QR twice                                    | Scan twice or concurrent requests                               | Exactly **one** confirmed attendance; stable duplicate result      | Confirmed                                             |
| AT-015 | Revoked/expired token                                            | Scan                                                            | Denied; event data/other attendee data not exposed                 | TTL TBD                                               |
| AT-016 | Valid event but location is beyond configured radius             | Try scan                                                        | No automatic attendance; option to request manual review           | Confirmed fallback                                    |
| AT-017 | Browser location blocked or inaccurate                           | Try scan                                                        | No automatic attendance; user can request manual review            | Confirmed fallback; accuracy threshold TBD            |
| AT-018 | Manual request submitted                                         | Before approval                                                 | State `PENDING`, not counted as attended                           | Confirmed                                             |
| AT-019 | KADIV HCO rejects manual request                                 | Decide                                                          | No attendance change; reason and reviewer stored                   | Confirmed                                             |
| AT-020 | HCO changes event grace to 30 min                                | Eligible SR checks in after start                               | Server uses **event-specific** grace rather than 15-min default    | Confirmed configurability; exact cutoff semantics TBD |
| AT-021 | HCO member                                                       | View/export event recap                                         | Only authorized event attendee fields; export audited per policy   | Confirmed access; columns TBD                         |
| AT-022 | SR accesses other's attendance record                            | Direct request                                                  | Forbidden, own-history only                                        | Confirmed                                             |
| AT-023 | Two independent requests approve manual and scan QR concurrently | Both reach DB                                                   | Unique event+SR confirmed record, consistent manual state/audit    | Required integrity                                    |
| AT-024 | Event created with malformed coordinates/radius/time             | Save                                                            | Rejected with validation error                                     | Required validation; range TBD                        |
| AT-025 | Actual SR on common smartphone and campus network                | End-to-end pilot                                                | Login, QR, GPS, fallback and history usable with HTTPS             | Mandatory UAT                                         |

## Approval fields

- **HCO policy validation:** TBD
- **PM acceptance:** TBD
- **Tester(s), date, environment and actual results:** TBD
- **Blocking issues/defects:** TBD

A `TBD` scenario is **not automatically passing**. Review the linked PRD before writing tests that assert unknown policy as fact.
