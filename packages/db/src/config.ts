export type DatabaseConfig = {
	DATABASE_URL: string;
	DB_POOL_MAX?: number;
	DB_POOL_IDLE_TIMEOUT_MS?: number;
	DB_SSL_CA?: string;
};
