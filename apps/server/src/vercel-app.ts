import type { Express } from "express";

import { createApp } from "./app";
import { ENV } from "./env.server";
import { auth, db } from "./services";

// Bundle source only; the persistent Bun listener remains in index.ts.
const app: Express = createApp(
	{
		auth,
		db,
		authConfig: ENV,
		authPerfDiagnosticsEnabled: ENV.AUTH_PERF_DIAGNOSTICS_ENABLED === "true",
	},
	ENV.CORS_ORIGIN,
);
export default app;
