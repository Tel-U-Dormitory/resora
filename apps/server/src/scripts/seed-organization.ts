import {
	localProvisioningTarget,
	verifyLocalProvisioningDatabase,
} from "@resora/api/modules/identity/sr-provisioning";
import { createDb, type Database } from "@resora/db";
import {
	OrganizationConflictError,
	seedOrganization,
} from "@resora/db/organization";

let db: Database | undefined;
try {
	const args = process.argv.slice(2).filter((arg) => arg !== "--");
	if (args.length === 1 && args[0] === "--help") {
		console.info(
			"org:seed [--apply] (default preview; local RESORA_IDENTITY_TEST_DB_URL only)",
		);
	} else {
		if (args.length > 1 || (args.length === 1 && args[0] !== "--apply"))
			throw new Error();
		const url = localProvisioningTarget(
			process.env.RESORA_IDENTITY_TEST_DB_URL,
		);
		db = createDb({ DATABASE_URL: url });
		await verifyLocalProvisioningDatabase(db, url);
		const apply = args[0] === "--apply";
		const counts = await seedOrganization(db, apply);
		console.info(
			`${apply ? "inserted" : "would insert"}: ${JSON.stringify(counts)}; standard totals=7/7/18`,
		);
	}
} catch (error) {
	if (error instanceof OrganizationConflictError) {
		console.error(error.message);
		console.error(JSON.stringify(error.conflicts));
	} else
		console.error(
			"ORGANIZATION_SEED_FAILED: check arguments and local scratch target; no secrets logged",
		);
	process.exitCode = 1;
} finally {
	await db?.$client.end();
}
