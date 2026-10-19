"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { queryErrorMessage } from "@/utils/request-error";
import { queryClient, trpc, trpcClient } from "@/utils/trpc";

export default function AccountPasswordReset({
	userId,
	name,
}: {
	userId: string;
	name: string;
}) {
	const [confirm, setConfirm] = useState(false);
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [pending, setPending] = useState(false);
	const submitting = useRef(false);
	if (password)
		return (
			<div className="space-y-2" role="status">
				<p>Password sementara {name} (ditampilkan sekali):</p>
				<code className="select-all break-all">{password}</code>
				<p className="text-muted-foreground text-xs">
					Sampaikan secara privat. Pemilik akun wajib menggantinya setelah
					login.
				</p>
				<Button
					variant="outline"
					onClick={() => {
						setPassword("");
						setConfirm(false);
					}}
				>
					Tutup
				</Button>
			</div>
		);
	return (
		<div className="space-y-2">
			{confirm ? (
				<>
					<p>Reset password {name}? Semua sesi akun ini akan diakhiri.</p>
					<Button
						disabled={pending}
						loading={pending}
						onClick={async () => {
							if (submitting.current) return;
							submitting.current = true;
							setPending(true);
							setError("");
							try {
								// One-time plaintext stays in component state, never the query/mutation cache.
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
									`${queryErrorMessage(failure)} Jika hasil tidak pasti, password mungkin sudah berubah; lakukan reset baru untuk memperoleh kredensial baru.`,
								);
							} finally {
								submitting.current = false;
								setPending(false);
							}
						}}
					>
						Konfirmasi reset
					</Button>
					<Button
						variant="outline"
						disabled={pending}
						onClick={() => {
							setConfirm(false);
							setError("");
						}}
					>
						Batal
					</Button>
				</>
			) : (
				<Button variant="outline" onClick={() => setConfirm(true)}>
					Reset password
				</Button>
			)}
			{error && (
				<p role="alert" className="text-destructive text-sm">
					{error}
				</p>
			)}
		</div>
	);
}
