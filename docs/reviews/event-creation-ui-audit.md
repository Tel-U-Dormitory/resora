# Audit UI/UX form pembuatan event — 2026-10-19

Scope: frontend create-event flow, shared create/edit editor, participant selection and location picker/map. Source inspection only; no browser or visual acceptance testing. This report proposes changes and does not implement them.

## Findings ranked by impact

| Priority | Finding and evidence | User impact | Recommended change |
| --- | --- | --- | --- |
| P1 | Only the save button and administrative reason are disabled by saving. Title, dates, participant controls and map remain interactive while the request uses an earlier input snapshot. event-form.tsx:248, 310, 397, 604, 681. | A user can change the visible draft during submission; the screen may suggest those changes were saved when they were not in the submitted payload. The existing submit lock already prevents duplicate requests. | Freeze editable fields and participant controls while saving; also gate map gestures/preset changes explicitly. Keep progress visible and preserve the draft on failure. |
| P1 | The only submit action is after the entire roster table and pagination. event-form.tsx:681. | Long mobile forms obscure the primary action and give no concise confirmation of what will be saved. | Provide a compact save action area with clear draft wording and participant count. A desktop sticky summary/mobile sticky footer must avoid covering focused fields, map attribution or the existing floating quick actions. Keep one semantic form and one save action. |
| P1 | Time errors are associated only with the end field, even when the start is invalid; general API errors render at the bottom. No error-summary focus/scroll exists. event-form.tsx:237, 369, 673. | Users may not see why saving failed or which section needs attention. | Add a focusable form error summary linking to invalid fields; keep field-level messages and aria-describedby. Do not rely on color or toast alone. Server validation remains authoritative. |
| P2 | Information event places title and description side by side at sm; location, radius, grace and QR TTL share one visual section. event-form.tsx:308, 391. | The hierarchy does not reflect how users plan a real activity. Secondary technical configuration consumes attention too early. | Stack title and description. Use four clear sections: information, schedule, location, participants. Put grace/QR TTL into secondary attendance settings with the existing defaults visible in a short summary and editable on demand. Do not change defaults/ranges. |
| P2 | Participant selection simultaneously exposes group chips, department chips, a combined INTI + KADEP action, search, counts, a table and pagination. Every row combines NIM/name/department/position in a single text run. event-form.tsx:445–655. | Selection rules and final selection are hard to scan, especially on mobile. | Keep the approved union/exclusion behavior. Separate group selection from participant review; emphasize selected count. Show name first, NIM/organization second, with a labeled selection target covering the row's control area. Preserve cross-page selections and deduplication. |
| P2 | Individual checkboxes are 16px with aria-label but no wrapping clickable label. Group/preset labels have padding but no explicit 44px minimum. event-form.tsx:604; event-location-picker.tsx:35. | Small touch targets make selection unnecessarily difficult. | Provide a 44px interaction area around the control; the visual checkmark may stay small. Reuse the existing shadcn Checkbox if its controlled behavior can preserve the current roster callbacks. |
| P2 | Default Dorm Hall still renders a full 320px map, long instructions and seven-decimal coordinates. Map has separate zoom help and a keyboard center-selection button. event-location-picker.tsx:51–65; event-location-map.tsx:94–133. | The default location takes substantial vertical space and exposes implementation detail as primary information. | Lead with the selected location and radius. Keep the map available with working zoom, drag/click pin and keyboard controls; shorten primary instructions and move coordinate precision to secondary details. Preserve OpenStreetMap attribution and tile-failure feedback. |
| P2 | All loading failures collapse into “Akses HCO dan sesi valid diperlukan”, including directory/network failures; there is no retry. event-form.tsx:84–100. | A recoverable service failure can be mistaken for a permission problem. The message also omits existing authorized SUPERADMIN capability. | Distinguish loading, authorization and service errors using existing error helpers; show retry when appropriate. Keep server capability gates and create/edit access unchanged. |

## Proposed layout

Desktop: a main form column with four sections, plus a narrow summary showing schedule, chosen location/radius and participant count. Mobile: a single ordered column; avoid duplicate summaries, horizontal scrolling and a mandatory wizard.

1. Informasi event — full-width title, optional description and clear required indicators.
2. Jadwal — start/end in WIB, compact duration/range feedback only when valid.
3. Lokasi & kehadiran — Dorm Hall or custom map pin; radius near the map; secondary grace/QR settings.
4. Peserta — group criteria, selected count, search and a readable individual review list.
5. Save draft action — explicit that saving does not publish or activate QR; retain the existing post-save review flow.

Use existing shadcn Card, Input, Textarea, Label, Button/buttonVariants and Checkbox where appropriate. Reuse the already attributed Uiverse inline spinner for saving; additional decorative effects and dependencies are unnecessary. Normal hover/focus feedback and reduced-motion support are sufficient.

## Boundaries and cautions

- Keep existing approved roster union/exclusion semantics, defaults, Dorm Hall coordinates, WIB conversion and backend eligibility/validation.
- Preserve FULL/LIMITED/METADATA edit capabilities. A create-mode visual redesign must not expose restricted edit fields or silently change advanced-edit payloads.
- Do not introduce automatic publish, automatic QR activation, autosave, geocoding, a new stepper framework or analytics.
- Collapsed secondary settings must open when they contain an error; required invalid controls must remain focusable.
- Desktop/mobile layout, touch target size and sticky-action collision are source-based risks requiring rendered UAT, not confirmed screenshots.

## Verification status

Read the complete editor, location picker/map, participant-selection references, existing schema constraints and relevant PRD rules. No production code, dependencies, schema or data changed. No tests/build rerun for this documentation-only audit. Browser, camera/map behavior, screen-reader flow and responsive appearance were not executed.

## Implementation follow-up

The prioritized fixes are now implemented in event-form.tsx and event-location-picker.tsx: save-time field/map locking; one sticky save action with draft/audit wording and participant count; focusable native/API/time error summary; invalid collapsed controls opened before correction; stacked title/description; secondary grace/QR controls; separate group/review headings; readable identities and 44px selection labels; compact default location/map disclosure and secondary coordinates; skeleton and retryable error state. The selected design remains one form with a compact action summary rather than introducing an additional desktop side panel or a wizard.

Focused tests exercise native validation revealing collapsed settings and locking map updates, alongside existing create/edit mutation/capability, roster and map-control regressions. Responsive appearance, sticky-action overlap, real browser validation/focus behavior and Leaflet interactions remain unverified until manual UAT. No dependency, schema, default-value or server policy change is introduced.
