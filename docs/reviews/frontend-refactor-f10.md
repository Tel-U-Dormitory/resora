# Frontend refactor F10 — Data resilience

Status: audit and safe in-memory correction implemented and tested locally. Durable persistence remains gated on PM policy. F11 has not started; the supplied F10 prompt explicitly requires PM review before F11. No push or release.

## Audit evidence

- Installed TanStack Query: 5.104.1. Existing shared QueryClient is the server-state cache; no installed query persistence adapter, dehydration/hydration or durable query store was found. No duplicate cache is needed.
- Personal profile/history use account-scoped versioned tRPC prefixes. Other generated tRPC keys include procedure inputs (resource/filter/period/page where supplied). A durable cache needs an approved per-module identity/organization/version contract before enabling it.
- Administrative snapshots/references/period queries intentionally retain the existing infinite in-memory cache for approved instant search; mutation/manual refresh remains authoritative. This phase does not change that policy.
- Successful login and logout clear the shared QueryClient. Failed logout retains the session for retry. SSR identity caching is request-scoped. These observations do not establish a durable-storage purge policy.
- Active browser preferences are workspace/public theme and sidebar collapse state. Legacy mobile quick-action preference code is not imported by the active UI. Forms retain current input in component memory; there is no durable draft restoration. Credentials, QR/location diagnosis and export responses are not added to browser persistence.
- No approved query/field allowlist, classification, retention/max age, size/eviction, logout/account-switch purge or module approval was found for personal/sensitive persistence. Interaction specification sections 4, 7 and 8 explicitly leave these decisions TBD. Durable drafts also require restore timestamp, account/resource/schema scoping and two-tab conflict handling; current component state does not satisfy that requirement.

## Implemented

Attendance refresh now invalidates the account-scoped personal history introduced in F6 and refetches only active matching observers. Inactive account history is marked stale without fetching it; unrelated profile cache remains untouched. Existing preview/QR lifecycle refetch exclusions remain intact. Query metadata identifies the resource without changing tRPC procedure keys or server inputs.

## Verified

- 87 tests passed, 942 assertions across attendance query refresh, personal pages, interaction UX and attendance check-in suites. The new real QueryClient/QueryObserver regression proves active history refresh, inactive account invalidation without fetch and unrelated profile isolation.
- Web TypeScript check, focused Biome and architecture checks passed.
- No visual markup/style change; no new browser/build run for this nonvisual correction. F6–F9 visual evidence remains documented in their phase reports. Persistent storage failure, cross-tab restore and durable logout purge are not tested because that mechanism is not implemented.

## PM decision required

Choose one before F11:

1. **Defer durable query/draft persistence** until a separately approved module policy exists; accept this documented F10 gap and proceed to final audit/UAT preparation with the current in-memory cache and recovery behavior.
2. **Implement persistence in this refactor:** first approve, per module, exact query/field allowlists and classification, retention/max age and size, logout/account-switch deletion, identity/organization scope and conflict behavior. Then implement and verify the adapter and drafts before F11.

No API, dependency, schema, business workflow, real data, environment or permission changes. No remote mutation. F10 persistence acceptance criteria are not claimed complete.
