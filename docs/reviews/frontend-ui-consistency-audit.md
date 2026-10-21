# Frontend UI consistency audit — 2026-10-19

Scope: all frontend route entry points, shared shell/navigation, Identity and Attendance feature surfaces, and shared UI primitives. Method: repository/source inspection and CLI checks. This is not a visual acceptance or accessibility certification.

## Findings and applied changes

| Finding | Resolution |
| --- | --- |
| Parallel web and shared Card/Button implementations | Existing web APIs now delegate to shared shadcn primitives. Legacy padding and loading/disabled/type props are retained. No bulk feature rewrite. |
| Shimmer and pulse skeleton implementations diverged | Web Skeleton delegates to the shared shadcn Skeleton. |
| Profile avatar differed from sidebar account avatar | Both use shared shadcn Avatar/Fallback and RESORA soft primary colors. |
| Operational page widths and alignment differed | Dashboard, event/history, detail/editor, accounts and profile share the 72rem page container. Account creation remains a centered narrow form. |
| Workspace card radii, labels and touch targets differed | Workspace cards use 16px corners and 20px content spacing; controls use 12px corners, labels 14px and mobile main buttons a 44px minimum target. |
| Active account badges used the brand action color | Active account badges now use the semantic success color, consistent with event/session status feedback. |
| Button-shaped navigation used Base UI Button render anchors | Dashboard, camera back link, mobile quick links and inline profile navigation use native Link semantics. Actual actions remain buttons. Sidebar/menu use their dedicated primitives. |
| Reduced-motion sidebar rule restored a transition after disabling it | Removed the conflicting declaration. New Uiverse spinner also stops animation when reduced motion is requested. |
| Uiverse had previously only been consulted as a reference | Inline loading spinner now adapts actual AHMED-MIT/curly-rabbit-4 source. CurrentColor, inline dimensions and reduced-motion behavior replace its fixed sizing/colors. MIT/source attribution recorded. |

## Route coverage

| Surface | Design treatment |
| --- | --- |
| Welcome and login | Existing branding/layout retained. Login inherits the shared button implementation through its compatibility wrapper. |
| Dashboard | Existing single main action and workspace cards; shadcn buttonVariants applied to the native primary navigation link. |
| Event list and own history | Matching grouped panels, mobile stacking, status hierarchy and shared compact WIB schedule formatter. |
| Event detail, recap and audit history | Existing Card/Button consumers inherit the consolidated primitives. Operational content and disclosure controls retained. |
| Event create/edit and location picker | Existing inputs/selects/textarea and Card/Button consumers inherit shared geometry and label scale. Map and permission gates retained. |
| Accounts and account creation | Consistent page alignment, shared filters/controls, semantic active status, existing mobile disclosures and credential delivery retained. |
| Profile and password change | Shared avatar, cards, labels and buttons. Password validation, visibility toggles and mandatory redirect retained. |
| Scanner | Intentional dark camera overlay retained for legibility. Native back-link semantics and 44px target. |
| Sidebar, quick actions and theme menu | Existing light default and RESORA tokens retained. Native destination links and reduced-motion rule corrected. |

The camera preview and white QR background intentionally differ from normal workspace cards. Replacing native operational dialogs or redesigning the approved welcome/login layouts is unnecessary for this consistency change. Unused library scaffolding is documented separately in the Ponytail audit and is not removed here.

## Component provenance

- shadcn/ui Base UI: existing shared Button, Card, Skeleton, Avatar, Sidebar, Sheet, Tooltip, DropdownMenu and form controls. Button/link usage checked against https://ui.shadcn.com/docs/components/base/button.
- Uiverse AHMED-MIT: https://uiverse.io/AHMED-MIT/curly-rabbit-4; source https://github.com/uiverse-io/galaxy/blob/main/loaders/AHMED-MIT_curly-rabbit-4.html.
- License notices: packages/ui/THIRD_PARTY_NOTICES.md.

## Verification and limits

- Web TypeScript: passed.
- Focused frontend regression suite: 45 passed across seven files, covering capability visibility, SSR redirects, credential forms, map controls, mobile shortcut geometry and existing attendance interactions.
- Shared component SSR checks: submit button remains a button; loading preserves disabled/aria-busy and the Uiverse indicator; enabled ghost button remains enabled; Card exposes shared and compatibility markers.
- Biome: all 15 changed source files passed.
- Production build: recorded in the task completion report.
- No dependency installation, schema/data mutation, remote environment changes or deployment.

Browser automation was not run, following AGENTS.md. Manual UAT remains: 375/768/1024/1440px; long Indonesian titles/names; keyboard focus and tooltip/menu behavior; actual form submissions and camera/GPS/map interactions; screen reader reading order; light/dark, reduced motion and contrast on real rendered surfaces. CLI success does not establish visual consistency at every breakpoint.
