import "varlock/auto-load";

import {
	checkConnection,
	connectionFailureMessage,
	getMigrationConnection,
} from "../src/connectivity";
import { ENV } from "../src/env";

const connection = getMigrationConnection(ENV);

try {
	await checkConnection(connection.url);
	console.info(`Migration preflight (${connection.key}): SELECT 1 succeeded.`);
} catch (error) {
	console.error(
		`Migration preflight (${connection.key}): ${connectionFailureMessage(error)}`,
	);
	process.exitCode = 1;
}
