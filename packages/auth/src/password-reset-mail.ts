import nodemailer from "nodemailer";
import { z } from "zod";

export type SmtpConfig = {
	SMTP_USER?: string;
	SMTP_PASS?: string;
	SMTP_PORT?: number;
};
export class ResetMailError extends Error {
	constructor(
		readonly code:
			| "SMTP_CONFIG"
			| "SMTP_AUTH"
			| "SMTP_CONNECT"
			| "SMTP_TLS"
			| "SMTP_SEND",
	) {
		super(code);
	}
}
export function smtpOptions(env: SmtpConfig) {
	const port = env.SMTP_PORT ?? 465;
	if (
		!z.email().safeParse(env.SMTP_USER).success ||
		!env.SMTP_PASS ||
		![465, 587].includes(port)
	)
		throw new ResetMailError("SMTP_CONFIG");
	return {
		host: "smtp.gmail.com",
		port,
		secure: port === 465,
		requireTLS: true,
		tls: { rejectUnauthorized: true, servername: "smtp.gmail.com" },
		auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
		connectionTimeout: 10000,
		greetingTimeout: 10000,
		socketTimeout: 15000,
		logger: false as const,
		debug: false,
		disableFileAccess: true,
		disableUrlAccess: true,
	};
}
export function resetMessage(to: string, link: string, sender: string) {
	const escaped = link
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
	return {
		from: { name: "RnD SR XIV", address: sender },
		to,
		subject: "RESORA — Reset password",
		text: `RESORA — RnD SR XIV\n\nReset password Anda: ${link}\n\nTautan berlaku 15 menit dan hanya dapat digunakan sekali. Jika Anda tidak meminta reset, abaikan email ini.`,
		html: `<h1>RESORA</h1><h2>Reset password</h2><p>RnD SR XIV</p><p><a href="${escaped}">Reset password Anda</a></p><p>Tautan berlaku 15 menit dan hanya dapat digunakan sekali.</p><p>Jika Anda tidak meminta reset, abaikan email ini.</p>`,
	};
}
export async function sendResetMail(env: SmtpConfig, to: string, link: string) {
	const options = smtpOptions(env); // Lazy: missing SMTP never breaks unrelated auth initialization.
	try {
		const result = await nodemailer
			.createTransport(options)
			.sendMail(resetMessage(to, link, env.SMTP_USER ?? ""));
		if (
			!result.accepted.some(
				(address) => String(address).toLowerCase() === to.toLowerCase(),
			)
		)
			throw new ResetMailError("SMTP_SEND");
	} catch (error) {
		if (error instanceof ResetMailError) throw error;
		const code = (error as { code?: string })?.code;
		throw new ResetMailError(
			code === "EAUTH"
				? "SMTP_AUTH"
				: ["ETIMEDOUT", "ECONNECTION", "EDNS", "ESOCKET"].includes(code ?? "")
					? "SMTP_CONNECT"
					: code === "ETLS"
						? "SMTP_TLS"
						: "SMTP_SEND",
		);
	}
}
