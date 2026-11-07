"use client";

import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@resora/ui/components/tooltip";
import { Check, Copy, KeyRound } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";
import { AccountModal } from "./account-modal";

export default function AccountPasswordReset({
	userId,
	name,
}: {
	userId: string;
	name: string;
}) {
	const [open, setOpen] = useState(false);
	const [password, setPassword] = useState("");
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const submitting = useRef(false);
	function close() {
		setOpen(false);
		setPassword("");
		setCopied(false);
		setError("");
	}
	return (
		<>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							variant="ghost"
							size="icon"
							className="resora-account-action size-11"
							aria-label={`Reset password ${name}`}
							onClick={() => setOpen(true)}
						/>
					}
				>
					<KeyRound size={18} aria-hidden="true" />
				</TooltipTrigger>
				<TooltipContent className="rounded-lg">Reset password</TooltipContent>
			</Tooltip>
			{open && (
				<AccountModal
					title={password ? "Password sementara siap" : "Reset password?"}
					description={
						password
							? `Password baru untuk ${name}. Salin sebelum menutup modal ini.`
							: `Semua sesi ${name} akan diakhiri. Pemilik akun wajib mengganti password saat login berikutnya.`
					}
					busy={pending}
					onClose={close}
				>
					{password ? (
						<div className="space-y-4">
							<div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/40 p-4">
								<code className="select-all break-all font-mono text-base">
									{password}
								</code>
								<Button
									variant="outline"
									size="icon"
									aria-label="Salin password sementara"
									onClick={async () => {
										try {
											await navigator.clipboard.writeText(password);
											setCopied(true);
											setError("");
										} catch {
											setError(
												"Tidak dapat menyalin otomatis. Pilih dan salin password secara manual.",
											);
										}
									}}
								>
									{copied ? <Check size={18} /> : <Copy size={18} />}
								</Button>
							</div>
							<p role="status" className="text-muted-foreground text-sm">
								{copied ? "Password disalin. " : ""}Password ditampilkan sekali.
								Sampaikan secara privat kepada pemilik akun.
							</p>
						</div>
					) : (
						<Button
							fullWidth
							loading={pending}
							disabled={pending}
							onClick={async () => {
								if (submitting.current) return;
								submitting.current = true;
								setPending(true);
								setError("");
								try {
									// One-time plaintext stays in component state; never in query/mutation cache.
									const result =
										await trpcClient.identity.resetAccountPassword.mutate({
											userId,
										});
									setPassword(result.temporaryPassword);
									void queryClient.invalidateQueries({
										queryKey: trpc.identity.accountSnapshot.pathKey(),
									});
								} catch (failure) {
									setError(
										`${queryErrorMessage(failure)} Jika hasil belum pasti, lakukan reset baru untuk mendapatkan kredensial baru.`,
									);
								} finally {
									submitting.current = false;
									setPending(false);
								}
							}}
						>
							Konfirmasi reset password
						</Button>
					)}
					{error && (
						<p role="alert" className="mt-3 text-destructive text-sm">
							{error}
						</p>
					)}
				</AccountModal>
			)}
		</>
	);
}
