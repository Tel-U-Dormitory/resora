import {
	checkConnection,
	connectionFailureMessage,
} from "@resora/db/connectivity";

import { ENV } from "../env.server";

const key = process.argv.includes("--direct")
	? "DIRECT_DB_URL"
	: "DATABASE_URL";
const url = ENV[key];

if (!url) {
	console.error(
		`${key} is not configured; no connection fallback was attempted.`,
	);
	process.exitCode = 1;
} else {
	try {
		await checkConnection(url);
		console.info(`${key}: SELECT 1 succeeded.`);
	} catch (error) {
		console.error(`${key}: ${connectionFailureMessage(error)}`);
		process.exitCode = 1;
	}
}
