import type { Metadata } from "next";
import PasswordRecoveryForm from "@/features/identity/password-recovery-form";

export const metadata: Metadata = {
	title: "Reset password | RESORA",
	robots: { index: false },
	referrer: "no-referrer",
};
export default function ResetPasswordPage() {
	return <PasswordRecoveryForm reset />;
}
