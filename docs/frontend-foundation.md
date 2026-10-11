# Frontend login and dashboard foundation

Status: implemented shell, not pilot/release acceptance. Scope requested: login and one empty dashboard, with only **Dashboard** in the sidebar.

## Confirmed behavior

- `/login` uses NIM/password through Better Auth Username Plugin. No registration or password recovery UI.
- `/dashboard` uses one responsive layout for every eligible SR. Desktop sidebar collapses; mobile sidebar opens with the header trigger and closes after selecting a menu.
- Session identity comes from Better Auth. `identity.me` resolves only the authenticated account through Express/tRPC and the existing identity tables. Missing, inactive and non-SR profiles are rejected. Frontend never queries Supabase directly or simulates a role in local storage.
- Department and position are returned from the database; UI permissions are returned by the backend. HCO management and KADIV HCO manual permission are distinct. These visibility flags do not replace authorization checks in future attendance procedures.
- Only Dashboard is currently visible. No attendance actions, fake metrics, events or QR generation are exposed.

## Reuse for frontend development

- `apps/web/src/components/ui/`: existing app-wide design system. Login reuses `Button`, `Card`, `Field` and `Input`, including password visibility and loading states.
- `apps/web/src/index.css`: existing brand colors, typography, spacing, radii, focus and motion tokens; imported once by the root layout. Preserve these tokens instead of styling each module independently.
- `apps/web/src/components/dashboard-shell.tsx`: session/profile states, sidebar and header composition. New dashboard routes reuse the dashboard layout and put feature content in `features/<domain>/` (flat, co-located files).
- `apps/web/src/config/navigation.ts`: one extensible menu registry. Add a feature menu only when released; use backend permissions for visibility, and enforce each operation again on the backend.
- `apps/web/src/config/auth-types.ts`: profile/permission types inferred from the tRPC contract, without invented position enums (Inti membership remains TBD).
- `packages/ui`: existing cross-app primitives remain available. The custom frontend design system remains under `apps/web/src/components/ui`; no duplicate copy or unnecessary move was introduced.

## Impact and validation

No migrations, database writes, provisioning, new environment variables or deployment. Existing `NEXT_PUBLIC_SERVER_URL`, Express CORS/trusted origins and Better Auth cookies must match the environment. A valid provisioned synthetic SR account with complete organization references is required to exercise the authenticated dashboard.

Validation: `pnpm run check-types`, `pnpm run lint`, `bun test packages/api/src/modules/identity/identity.policy.test.ts`, `pnpm --dir apps/web run build`. Record actual outcomes in the implementation handover; successful policy unit tests do not establish login/session/database integration.

Remaining identity work includes authentication-level inactive-account enforcement, provisioning, first-login password change and configured-domain cookie UAT. The new profile endpoint denies inactive dashboard access; it does not claim to complete those identity workflows. Attendance routes/transactions remain unimplemented and require NEED-001 acceptance/UAT separately.

### Verification recorded 2026-10-11

- Workspace `check-types`: passed (6 package tasks); frontend typecheck passed again after the header change.
- Next.js production build: passed and generated `/`, `/login`, `/dashboard` with Varlock enabled. Validation used public local `NEXT_PUBLIC_SERVER_URL=http://localhost:3000`; required escalated execution because sandbox child-process execution prevented Varlock from loading.
- Biome checks on the 18 focused TS/TSX files: passed. Full repository lint still fails with existing formatting/lint issues (including unchanged primitives/configuration); no repository-wide autoformat applied. Global CSS and the existing sidebar primitive retain their existing formatting.
- Bun 1.3.13 policy tests: 2 passed, 16 assertions. The runtime was invoked through `pnpm dlx bun@1.3.13`; no Bun system install.
- Browser: login rendered at desktop/default viewport and 390 × 844 mobile viewport. Direct dashboard navigation showed the session-error/retry state because the local auth backend was unavailable; no authenticated database login, department-specific dashboard, logout or mobile sidebar interaction was claimed as verified.
- Dependency setup used the unchanged frozen lockfile, with a user-approved one-time release-age exception for `lucide-react@1.55.0`. No persisted exception, lockfile or package configuration changes. Node PATH and `verifyDepsBeforeRun=false` were command-local runtime settings.
