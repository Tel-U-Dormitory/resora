import type { Session } from "@resora/auth";
import type { Database } from "@resora/db";

export type Context = {
	session: Session | null;
	db: Database;
	qrSigningSecret?: string;
};
