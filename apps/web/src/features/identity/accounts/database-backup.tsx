"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getServerUrl } from "@/utils/server-url";

export default function DatabaseBackup() {
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [failed, setFailed] = useState(false);
	async function download() {
		setBusy(true);
		setMessage("");
		setFailed(false);
		try {
			const response = await fetch(
				`${getServerUrl(process.env.NEXT_PUBLIC_SERVER_URL)}/api/admin/database-backup`,
				{
					method: "POST",
					credentials: "include",
					cache: "no-store",
				},
			);
			if (!response.ok) {
				setFailed(true);
				setMessage(
					response.status === 409
						? "Backup lain sedang berjalan. Tunggu hingga selesai."
						: response.status === 401 || response.status === 403
							? "Akses ditolak. Masuk kembali dengan akun SUPERADMIN yang aktif."
							: "Backup belum tersedia atau gagal dibuat. Hubungi pengelola server dan coba kembali.",
				);
				return;
			}
			const filename =
				/filename="(resora-[\dTZ-]+\.dump)"/.exec(
					response.headers.get("content-disposition") ?? "",
				)?.[1] ?? "resora-backup.dump";
			const blob = await response.blob();
			if (!blob.size) throw new Error("Empty backup");
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = filename;
			document.body.append(link);
			link.click();
			link.remove();
			setTimeout(() => URL.revokeObjectURL(url), 60_000);
			setMessage(
				"File siap diunduh. Pastikan unduhan selesai dan simpan di tempat yang aman.",
			);
		} catch {
			setFailed(true);
			setMessage("Unduhan gagal. Periksa koneksi lalu coba kembali.");
		} finally {
			setBusy(false);
		}
	}
	return (
		<Card>
			<details>
				<summary className="focus-ring cursor-pointer rounded-xl p-5 font-medium text-sm">
					Backup database
				</summary>
				<CardContent className="space-y-3">
					<p className="text-muted-foreground text-sm">
						Unduh seluruh data RESORA untuk pemulihan manual. File memuat data
						pribadi dan informasi autentikasi; simpan dengan aman dan jangan
						bagikan.
					</p>
					<Button
						variant="outline"
						onClick={download}
						disabled={busy}
						loading={busy}
					>
						{busy ? "Menyiapkan backup…" : "Unduh backup data"}
					</Button>
					{message && (
						<p
							role={failed ? "alert" : "status"}
							className={
								failed
									? "text-destructive text-sm"
									: "text-muted-foreground text-sm"
							}
						>
							{message}
						</p>
					)}
				</CardContent>
			</details>
		</Card>
	);
}
