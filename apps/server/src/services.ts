import { createAuth } from "@resora/auth";
import { createDb } from "@resora/db";
import { waitUntil } from "@vercel/functions";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db, [], {
	backgroundTask: (work) => {
		const guarded = work.catch(() =>
			console.error("PASSWORD_RESET_DELIVERY_FAILED"),
		);
		// Persistent Node/Bun retains pending I/O; Vercel needs lifecycle extension.
		if (process.env.VERCEL === "1") waitUntil(guarded);
	},
});
