import type { Metadata } from "next";
import { PasswordRecoveryForm } from "@/features/identity/public";

export const metadata: Metadata = {
	title: "Lupa password | RESORA",
	robots: { index: false },
	referrer: "no-referrer",
};
export default function ForgotPasswordPage() {
	return <PasswordRecoveryForm />;
}
