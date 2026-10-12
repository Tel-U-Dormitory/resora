"use client";

import { Button } from "@resora/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@resora/ui/components/dropdown-menu";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/trpc";

export default function UserMenu({ inline = false }: { inline?: boolean }) {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const [pending, setPending] = useState(false);
	const signOut = async () => {
		setPending(true);
		try {
			const result = await authClient.signOut();
			if (result.error) {
				toast.error("Sesi belum berhasil diakhiri. Coba kembali.");
				return;
			}
			queryClient.clear();
			router.replace("/login");
			router.refresh();
		} catch {
			toast.error("Layanan tidak tersedia. Sesi belum berhasil diakhiri.");
		} finally {
			setPending(false);
		}
	};
	if (isPending) return <Skeleton className="h-9 w-24" />;
	if (!session)
		return (
			<Link
				className="focus-ring inline-flex h-9 items-center rounded-md border border-border px-4 font-semibold text-sm hover:bg-muted"
				href="/login"
			>
				Masuk SR
			</Link>
		);
	if (inline)
		return (
			<Button
				variant="outline"
				className="w-full rounded-md"
				disabled={pending}
				onClick={signOut}
			>
				{pending ? "Memproses…" : "Keluar"}
			</Button>
		);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<Button variant="outline" />}>
				{session.user.name}
			</DropdownMenuTrigger>
			<DropdownMenuContent className="bg-card">
				<DropdownMenuGroup>
					<DropdownMenuLabel>Akun SR</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem render={<Link href="/change-password" />}>
						Ganti password
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						disabled={pending}
						onClick={signOut}
					>
						{pending ? "Memproses…" : "Keluar"}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
