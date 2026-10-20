# Frontend Ponytail audit — 2026-10-19

Scope: `apps/web` and `packages/ui`, including source imports, manifests, and configuration. Static repository inspection; findings are proposals only. Line estimates describe source removable from the current tree, not measured bundle savings. Welcome/login and their styled-components dependency are excluded from cleanup.

- delete: Remove unused chat scaffold (`attachment`, `bubble`, `marker`, `message`, `message-scroller`), 630 lines; no app imports found. Replacement: nothing until a chat capability is approved; `@shadcn/react` is referenced only by the unused scroller and can then be removed. [components](../../packages/ui/src/components/)
- delete: Remove unused shared Empty, Checkbox, and Switch files, 156 lines; no consumers found in the workspace. Replacement: native controls already used by features; retain shared Card and Base UI for the active cards/dialogs/dropdowns/buttons. [components](../../packages/ui/src/components/)
- delete: Remove unused `AvatarGroup` (20 lines) and web `CardFooter` (14 lines). Replacement: nothing; both exports have no consumers. [avatar](../../apps/web/src/components/ui/avatar.tsx), [card](../../apps/web/src/components/ui/card.tsx)
- yagni: Remove the 11-line ThemeProvider pass-through. Replacement: import `ThemeProvider` directly from `next-themes` in the existing client Providers file with the same props. [theme-provider](../../apps/web/src/components/theme-provider.tsx)

Tooltip is now used by the shadcn icon rail and is excluded from the deletion proposal. The ThemeProvider wrapper and unused chat exports remain unchanged.

Shared Card is now used by dashboard, event/history views and the legacy web wrapper; it is no longer a deletion candidate.

net: -831 lines, -1 deps possible (source estimates from the initial audit, adjusted for Card reuse).
