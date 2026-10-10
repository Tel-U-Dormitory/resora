import { defineConfig } from "drizzle-kit";
import "varlock/auto-load";

import { getMigrationConnection } from "./src/connectivity";
import { ENV } from "./src/env";

const connection = getMigrationConnection(ENV);
console.info(`Drizzle Kit connection: ${connection.key}`);

export default defineConfig({
	schema: "./src/schema/index.ts",
	out: "./src/migrations",
	dialect: "postgresql",
	schemaFilter: ["public"],
	dbCredentials: {
		url: connection.url,
	},
});
