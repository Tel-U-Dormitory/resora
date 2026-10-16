import { createApp } from "./app";
import { databaseBackup } from "./database-backup";
import { ENV } from "./env.server";
import { auth, db } from "./services";

const app = createApp(
	{
		auth,
		db,
		authConfig: ENV,
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
