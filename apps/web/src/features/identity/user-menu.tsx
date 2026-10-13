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
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type RefObject, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/trpc";

export default function UserMenu({
	name,
	onNavigate,
	container,
}: {
	name?: string;
	onNavigate?: () => void;
	container?: RefObject<HTMLDialogElement | null>;
}) {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const [pending, setPending] = useState(false);
	const signOut = async () => {
		if (pending) return;
		setPending(true);
		try {
			const result = await authClient.signOut();
			if (result.error) {
				toast.error("Sesi belum berhasil diakhiri. Coba kembali.");
				return;
			}
			queryClient.clear();
			onNavigate?.();
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
				Masuk sebagai SR
			</Link>
		);
	return (
		<DropdownMenu>
			<DropdownMenuTrigger
				disabled={pending}
				aria-label={`Menu akun ${name ?? session.user.name}`}
				render={
					<Button
						variant="ghost"
						className={
							name
								? "h-auto w-full justify-start rounded-lg p-2 text-left"
								: "h-auto rounded-lg p-2"
						}
					/>
				}
			>
				<Avatar name={name ?? session.user.name} shape="squircle" size="sm" />
				<span className="min-w-0 flex-1">
					<span className="block max-w-40 truncate font-semibold text-sm">
						{name ?? session.user.name}
					</span>
					<span className="block text-muted-foreground text-xs">
						{pending ? "Memproses…" : "Akun SR"}
					</span>
				</span>
				<ChevronDown className="size-4 shrink-0" aria-hidden="true" />
			</DropdownMenuTrigger>
			<DropdownMenuContent
				container={container}
				align="end"
				className="min-w-48 rounded-lg bg-card"
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel>Akun SR</DropdownMenuLabel>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						onClick={onNavigate}
						render={<Link href="/profile" />}
					>
						<UserRound aria-hidden="true" />
						Profil Saya
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						disabled={pending}
						onClick={signOut}
					>
						<LogOut aria-hidden="true" />
						{pending ? "Memproses…" : "Keluar"}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
