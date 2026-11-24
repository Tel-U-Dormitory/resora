import { createAuth } from "@resora/auth";
import { createDb } from "@resora/db";
import { createR2Storage, type R2StorageConfig } from "@resora/storage";
import { waitUntil } from "@vercel/functions";

import { ENV } from "./env.server";

export const db = createDb(ENV);
const r2Config: Partial<R2StorageConfig> = {
	accountId: ENV.R2_ACCOUNT_ID,
	accessKeyId: ENV.R2_ACCESS_KEY_ID,
	secretAccessKey: ENV.R2_SECRET_ACCESS_KEY,
	privateBucket: ENV.R2_PRIVATE_BUCKET,
	publicBucket: ENV.R2_PUBLIC_BUCKET,
	publicBaseUrl: ENV.R2_PUBLIC_BASE_URL,
};
function hasR2Config(
	config: Partial<R2StorageConfig>,
): config is R2StorageConfig {
	const values = Object.values(config);
	if (values.every((value) => !value)) return false;
	if (values.some((value) => !value))
		throw new Error("R2 storage configuration is incomplete");
	return true;
}

export const storage = hasR2Config(r2Config)
	? createR2Storage(r2Config)
	: undefined;
export const auth = createAuth(ENV, db, [], {
	backgroundTask: (work) => {
		const guarded = work.catch(() =>
			console.error("PASSWORD_RESET_DELIVERY_FAILED"),
		);
		// Persistent Node/Bun retains pending I/O; Vercel needs lifecycle extension.
		if (process.env.VERCEL === "1") waitUntil(guarded);
	},
});
