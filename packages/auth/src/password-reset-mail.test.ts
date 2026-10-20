import { expect, spyOn, test } from "bun:test";
import nodemailer from "nodemailer";
import {
	resetMessage,
	sendResetMail,
	smtpOptions,
} from "./password-reset-mail";

const config = {
	SMTP_USER: "synthetic@example.invalid",
	SMTP_PASS: "synthetic-app-password",
};
test("Gmail TLS is mandatory on 465/587, logging and external attachment reads disabled", () => {
	for (const port of [465, 587]) {
		const options = smtpOptions({ ...config, SMTP_PORT: port });
		expect(options).toMatchObject({
			host: "smtp.gmail.com",
			port,
			secure: port === 465,
			requireTLS: true,
			tls: { rejectUnauthorized: true, servername: "smtp.gmail.com" },
			logger: false,
			debug: false,
			disableFileAccess: true,
			disableUrlAccess: true,
		});
	}
	expect(() => smtpOptions({})).toThrow("SMTP_CONFIG");
	expect(() => smtpOptions({ ...config, SMTP_PORT: 25 })).toThrow(
		"SMTP_CONFIG",
	);
	const message = resetMessage(
		config.SMTP_USER,
		"https://web.example.test/reset-password#token=synthetic",
		config.SMTP_USER,
	);
	expect(message.from.name).toBe("RnD SR XIV");
	expect(message.text).toContain("15 menit");
	expect(message.html).toContain("abaikan email");
});

test("mocked SMTP records acceptance or safe error categories without real delivery", async () => {
	for (const code of [
		undefined,
		"EAUTH",
		"ETIMEDOUT",
		"ETLS",
		"PRIVATE_UNKNOWN",
	]) {
		const transport = spyOn(nodemailer, "createTransport").mockReturnValue({
			sendMail: async () => {
				if (code)
					throw Object.assign(Error("sensitive SMTP details"), { code });
				return { accepted: [config.SMTP_USER] };
			},
		} as unknown as ReturnType<typeof nodemailer.createTransport>);
		try {
			if (!code)
				await sendResetMail(
					config,
					config.SMTP_USER,
					"https://web.example.test/reset-password#token=synthetic",
				);
			else
				await expect(
					sendResetMail(
						config,
						config.SMTP_USER,
						"https://web.example.test/reset-password#token=synthetic",
					),
				).rejects.toMatchObject({
					message:
						code === "EAUTH"
							? "SMTP_AUTH"
							: code === "ETIMEDOUT"
								? "SMTP_CONNECT"
								: code === "ETLS"
									? "SMTP_TLS"
									: "SMTP_SEND",
				});
		} finally {
			transport.mockRestore();
		}
	}
});
