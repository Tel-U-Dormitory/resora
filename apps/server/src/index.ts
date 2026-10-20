import { createApp } from "./app";
import { databaseBackup } from "./database-backup";
import { ENV } from "./env.server";
import { auth, db } from "./services";

// Persistent production ingress must be authenticated by NPM. Development and
// the separate Vercel entrypoint retain their existing socket/platform policy.
if (ENV.NODE_ENV === "production" && !ENV.AUTH_PROXY_SECRET)
	throw new Error(
		"AUTH_PROXY_SECRET is required for persistent production ingress",
	);

const app = createApp(
	{
		auth,
		db,
		authConfig: ENV,
		authProxySecret: ENV.AUTH_PROXY_SECRET,
		backup:
			ENV.DATABASE_BACKUP_ENABLED === "true"
				? databaseBackup(db, ENV)
				: undefined,
		authPerfDiagnosticsEnabled: ENV.AUTH_PERF_DIAGNOSTICS_ENABLED === "true",
	},
	ENV.CORS_ORIGIN,
);

app.listen(3000, () => {
	console.log("Server is running on http://localhost:3000");
});
