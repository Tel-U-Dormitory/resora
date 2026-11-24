import type { AuthConfig, Session } from "@resora/auth";
import type { Database } from "@resora/db";
import type { ObjectStorage } from "@resora/storage";

export type Context = {
	session: Session | null;
	db: Database;
	storage?: ObjectStorage;
	qrSigningSecret?: string;
	// Backend-only configuration for transaction-bound Better Auth internal creation.
	authConfig?: AuthConfig;
};
