"use client";

import { Button } from "@resora/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@resora/ui/components/dropdown-menu";
import { ChevronDown, ChevronUp, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { queryClient } from "@/utils/trpc";

export default function UserMenu({
	name,
	accountLabel = "Pengguna RESORA",
	onNavigate,
	container,
}: {
	name?: string;
	accountLabel?: string;
	onNavigate?: () => void;
	container?: RefObject<HTMLDialogElement | null>;
}) {
	const router = useRouter();
	const { data: session, isPending } = authClient.useSession();
	const [pending, setPending] = useState(false);
	const [open, setOpen] = useState(false);
	const inline = Boolean(container);
	const inlineRoot = useRef<HTMLDivElement>(null);
	const displayName = name ?? session?.user.name ?? "Pengguna RESORA";
	useEffect(() => {
		if (!inline || !open) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (
				event.target instanceof Node &&
				!inlineRoot.current?.contains(event.target)
			)
				setOpen(false);
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				setOpen(false);
			}
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [inline, open]);
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
	const triggerContents = (
		<>
			<Avatar name={displayName} shape="squircle" size="sm" />
			<span className="min-w-0 flex-1 text-left">
				<span className="block truncate font-semibold text-sm">
					{displayName}
				</span>
				<span className="block truncate text-muted-foreground text-xs">
					{accountLabel}
				</span>
			</span>
			{open ? (
				<ChevronUp className="size-4 shrink-0" aria-hidden="true" />
			) : (
				<ChevronDown className="size-4 shrink-0" aria-hidden="true" />
			)}
		</>
	);
	const triggerClass = `h-auto min-h-11 ${name ? "w-full" : "w-auto max-w-56"} justify-start gap-2.5 rounded-xl p-2 text-left`;
	const profileItem = (
		<Button
			render={
				<Link
					href="/profile"
					onClick={() => {
						setOpen(false);
						onNavigate?.();
					}}
				/>
			}
			variant="ghost"
			className="min-h-11 w-full justify-start gap-2.5 rounded-lg px-3 text-sm"
		>
			<UserRound aria-hidden="true" /> Profil Saya
		</Button>
	);
	const logoutItem = (
		<Button
			variant="destructive"
			disabled={pending}
			className="min-h-11 w-full justify-start gap-2.5 rounded-lg px-3 text-sm"
			onClick={signOut}
		>
			<LogOut aria-hidden="true" /> {pending ? "Memproses…" : "Keluar"}
		</Button>
	);
	const accountHeader = (
		<div className="flex min-w-0 items-center gap-3 border-border border-b px-3 py-3">
			<Avatar name={displayName} shape="squircle" size="md" />
			<div className="min-w-0 flex-1">
				<p className="truncate font-semibold text-sm" title={displayName}>
					{displayName}
				</p>
				<p className="truncate text-muted-foreground text-xs">{accountLabel}</p>
			</div>
		</div>
	);
	if (inline)
		return (
			<div ref={inlineRoot} className="w-full">
				<Button
					variant="ghost"
					disabled={pending}
					aria-label={`Menu akun ${displayName}`}
					aria-expanded={open}
					aria-controls="account-menu-options"
					onClick={() => setOpen(!open)}
					className={triggerClass}
				>
					{triggerContents}
				</Button>
				{open && (
					<div
						id="account-menu-options"
						className="mt-2 space-y-1 rounded-xl border border-border bg-surface p-2 shadow-sm"
					>
						{accountHeader}
						{profileItem}
						{logoutItem}
					</div>
				)}
			</div>
		);
	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger
				disabled={pending}
				aria-label={`Menu akun ${displayName}`}
				render={<Button variant="ghost" className={triggerClass} />}
			>
				{triggerContents}
			</DropdownMenuTrigger>
			<DropdownMenuContent
				container={container}
				side="top"
				sideOffset={6}
				align="start"
				className="!w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-2 shadow-xl"
			>
				{accountHeader}
				<div className="space-y-1 pt-2">
					<DropdownMenuItem
						onClick={onNavigate}
						render={<Link href="/profile" />}
						className="min-h-11 rounded-lg px-3 text-sm"
					>
						<UserRound aria-hidden="true" /> Profil Saya
					</DropdownMenuItem>
					<DropdownMenuItem
						variant="destructive"
						disabled={pending}
						onClick={signOut}
						className="min-h-11 rounded-lg px-3 text-sm"
					>
						<LogOut aria-hidden="true" /> {pending ? "Memproses…" : "Keluar"}
					</DropdownMenuItem>
				</div>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
