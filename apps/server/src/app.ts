import { appRouter } from "@resora/api/routers/index";
import type { Auth, AuthConfig } from "@resora/auth";
import type { Database } from "@resora/db";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express from "express";

import { createContext } from "./context";

export function createApp(
	services: { db: Database; auth: Auth; authConfig?: AuthConfig },
	origin: string,
) {
	const app = express();
	const trustedOrigin = new URL(origin).origin;
	const authHandler = toNodeHandler(async (request) => {
		const response = await services.auth.handler(request);
		// Better Auth can return an internal-error response instead of throwing.
		return response.status >= 500
			? Response.json(
					{
						code: "AUTH_UNAVAILABLE",
						message: "Authentication service unavailable",
					},
					{ status: 503 },
				)
			: response;
	});
	app.disable("x-powered-by");
	app.use((_req, res, next) => {
		res.set({
			"X-Content-Type-Options": "nosniff",
			"X-Frame-Options": "DENY",
			"Referrer-Policy": "strict-origin-when-cross-origin",
		});
		next();
	});
	app.use(["/api/auth", "/trpc"], (_req, res, next) => {
		res.set("Cache-Control", "no-store");
		next();
	});
	app.use("/trpc", (req, res, next) => {
		const requestOrigin = req.get("origin");
		const unsafeMethod = !["GET", "HEAD", "OPTIONS"].includes(req.method);
		// CORS limits browser reads; independently reject cookie-authenticated cross-origin writes.
		// Originless server-side queries remain available to the Next.js SSR session check.
		if (
			(requestOrigin && requestOrigin !== trustedOrigin) ||
			(unsafeMethod && !requestOrigin)
		) {
			res.status(403).json({ error: "Request origin is not allowed" });
			return;
		}
		next();
	});
	app.use(
		cors({
			origin: (requestOrigin, done) =>
				done(null, requestOrigin === trustedOrigin),
			methods: ["GET", "POST", "OPTIONS"],
			allowedHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	);
	app.all("/api/auth{/*path}", async (req, res) => {
		const operation =
			req.path === "/api/auth/sign-in/username"
				? "LOGIN"
				: req.path === "/api/auth/change-password"
					? "PASSWORD_CHANGE"
					: null;
		if (req.method === "POST" && operation) {
			const started = Date.now();
			res.once("finish", () => {
				const status = res.statusCode;
				const pool = services.db.$client;
				console.info("AUTH_REQUEST_RESULT", {
					operation,
					status,
					outcome:
						status === 429
							? "RATE_LIMITED"
							: status === 503
								? "UNAVAILABLE"
								: status >= 200 && status < 300
									? "SUCCESS"
									: "REJECTED",
					durationMs: Date.now() - started,
					...(status === 503 && pool
						? {
								poolTotal: pool.totalCount,
								poolIdle: pool.idleCount,
								poolWaiting: pool.waitingCount,
							}
						: {}),
				});
			});
		}
		// Never accept an arbitrary client-supplied forwarded IP as a limiter key.
		// Trust proxy stays false until deployment's proxy boundary is approved.
		req.headers["x-resora-client-ip"] = req.socket.remoteAddress || "127.0.0.1";
		try {
			await authHandler(req, res);
		} catch {
			// Storage/migration outages must fail closed without Express logging a raw error.
			if (!res.headersSent) {
				res.status(503).json({
					code: "AUTH_UNAVAILABLE",
					message: "Authentication service unavailable",
				});
			} else {
				res.end();
			}
		}
	});
	app.use(
		"/trpc",
		createExpressMiddleware({
			router: appRouter,
			createContext: (opts) => createContext(services, opts),
		}),
	);
	app.get("/", (_req, res) => res.status(200).send("OK"));
	return app;
}
