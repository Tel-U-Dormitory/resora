import type { AuthConfig, Session } from "@resora/auth";
import type { Database } from "@resora/db";

export type Context = {
	session: Session | null;
	db: Database;
	qrSigningSecret?: string;
	// Backend-only configuration for transaction-bound Better Auth internal creation.
	authConfig?: AuthConfig;
};
