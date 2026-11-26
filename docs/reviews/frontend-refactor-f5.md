# Frontend refactor F5 — Inbox

Status: implemented and tested locally; verification results below. PM UAT/release sign-off remains separate. Stop before F6.

## Scope and sources

Routes `/broadcasts`, `/broadcasts/history`, and the shared broadcast feed/detail/form presentation. Sources: PRD §6.3 B1/B2, canonical Design System 1.1 and linked interaction/component/verification specifications, supplied F5 prompt, the rough `InboxPage` reference, mobile JPEG references, and the actual broadcast router/contracts/service and frontend tests. Applied the UI/UX, design-taste, principles, copy, accessibility, Tailwind, React/Next, mobile and minimal-change skills already active in this refactor. The reference's category chips, mock unread behavior, and load-more pagination are not substitutes for the existing approved broadcast contract.

## Implemented

- Inbox uses a readable single-column announcement list with author, publication/expiry WIB, safe optional external link and full detail dialog. Active/history navigation retains existing routes and server filtering. History remains readable by eligible readers and strictly read-only, including detail.
- Creation is in a labeled management section; edit/archive are behind a separate per-record management disclosure. Session capability gates create; live DTO capabilities and ACTIVE status gate edit/archive. Existing server authorization, expiry/ownership, confirmation, validation, pending safeguards, safe errors, retry and Broadcast-only invalidation are retained.
- Search matches title, body or sender on the current fetched page only, case-insensitively. Its visible label and hint explain the maximum 10-item scope; a no-match state provides reset. Server pagination remains limit 10 / offset, total and clamping unchanged. Moving pages clears the search. Cross-page/server search remains TBD because the strict existing API has no search parameter; no bulk prefetch or new backend behavior was invented.
- Loading, empty, list/detail error/retry and paused-network feedback are distinct. Query data is in-memory only; no new persistent cache or sensitive drafts. Existing query mount revalidation and server session/record checks remain.
- Larger metadata, touch targets, long-word wrapping, text enlargement and consistent Indonesian copy. Added missing dashboard test-double icons for F4 upcoming cards discovered by the broader regression suite.

No unread/read receipts, new badge count, chat, notifications, delivery rules, roles, API, database, dependency or environment configuration changes. Public landing/login untouched. Browser fixtures intercept only local synthetic requests; no remote mutation or production deployment.

## Verification

- `bun --no-env-file test` for broadcast UI, interaction workflow and dashboard fixture suites: **49 passed, 0 failed, 718 assertions**. Includes existing validation, mutation failure/input retention, pending submission, live capability, safe-link/plain-text, and invalidation coverage; new loaded-page search/pagination regression checks.
- Web `tsc --noEmit`: passed. Bun's shell emitted stream-fd sandbox warnings; TypeScript output was empty and exit status was zero.
- Focused Biome: passed; architecture check: passed with no exceptions; `git diff --check`: passed.
- Final isolated Next webpack production build: passed (exit 0). No live database or remote service used.
- Final Chromium 158.0.8127.18 run passed after the dialog gutter improvement: 320/390/768/1024/1440, light/dark, long-title/content reflow, current-page search/no-match/reset, server pagination, keyboard detail/Escape/focus restoration, 200% text plus spacing, create form and archive confirmation, record management disclosure, history read-only even when DTO grants flags, member capabilities, slow loading, list/detail error/retry, empty state, and cached detail paused offline/revalidated after reconnect. No runtime errors. Screenshot review confirmed the final dialog gutter improvement. The shared dashboard feed regression also passed: static coming-soon cards, four widths and 200% text including management controls.
- Evidence: `output/playwright/f5/` (synthetic screenshots and results JSON, kept local).

## Limits and follow-up

Real-device Safari/Android/Brave, native screen-reader testing, field performance, backend integration against a real authorized DB and PM UAT/release are not demonstrated by local Chromium fixtures. Existing mutation behavior is covered by transport-double tests; final browser checks do not send real announcements. Server-wide search and read/unread semantics need separate requirements/API approval. F6 awaits PM review.
