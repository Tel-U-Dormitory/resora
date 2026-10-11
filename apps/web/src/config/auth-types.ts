import type { AppRouter } from "@resora/api/routers/index";
import type { inferRouterOutputs } from "@trpc/server";

type Identity = inferRouterOutputs<AppRouter>["identity"]["me"];
export type UserProfile = Identity["user"];
export type UserRolePermissions = Identity["permissions"];
