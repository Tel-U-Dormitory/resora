"use client";

import { ActionDialog } from "@resora/ui/components/action-dialog";
import { Button } from "@resora/ui/components/button";
import {
	CalendarDays,
	Check,
	History,
	LayoutDashboard,
	ListChecks,
	LockKeyhole,
	Menu,
	Plus,
	ScanLine,
	Settings2,
	X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { quickActionPosition } from "./quick-action-layout";

const choices = [
	{ href: "/dashboard", title: "Dashboard", icon: LayoutDashboard },
	{ href: "/events", title: "Event internal", icon: CalendarDays },
	{ href: "/attendance/history", title: "Riwayat kehadiran", icon: History },
	{
		href: "/events?view=manage",
		title: "Kelola event",
		icon: ListChecks,
		management: true,
	},
	{ href: "/events/new", title: "Buat event", icon: Plus, management: true },
] as const;

export function MobileQuickActions({
	canManageEvents,
}: {
	canManageEvents: boolean;
}) {
	const pathname = usePathname();
	const { data: session } = authClient.useSession();
	const storageKey = session?.user.id
		? `resora:quick-actions:${session.user.id}`
		: null;
	const [selection, setSelection] = useState<{
		key: string;
		hrefs: string[];
	} | null>(null);
	const [openPath, setOpenPath] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const root = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement>(null);
	const open = openPath === pathname;
	const available = choices.filter(
		(item) => !("management" in item) || canManageEvents,
	);
	const selected = (
		selection?.key === storageKey ? (selection?.hrefs ?? []) : []
	).filter((href) => available.some((item) => item.href === href));
	useEffect(() => {
		if (!storageKey) return;
		try {
			const saved: unknown = JSON.parse(
				localStorage.getItem(storageKey) ?? "[]",
			);
			setSelection({
				key: storageKey,
				hrefs: Array.isArray(saved)
					? [
							...new Set(
								saved.filter(
									(href): href is string =>
										typeof href === "string" &&
										choices.some((item) => item.href === href),
								),
							),
						].slice(0, 4)
					: [],
			});
		} catch {
			setSelection({ key: storageKey, hrefs: [] });
		}
	}, [storageKey]);
	useEffect(() => {
		if (!open) return;
		const outside = (event: PointerEvent) => {
			if (event.target instanceof Node && !root.current?.contains(event.target))
				setOpenPath(null);
		};
		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setOpenPath(null);
				trigger.current?.focus();
			}
		};
		document.addEventListener("pointerdown", outside);
		document.addEventListener("keydown", handleEscape);
		return () => {
			document.removeEventListener("pointerdown", outside);
			document.removeEventListener("keydown", handleEscape);
		};
	}, [open]);
	const toggle = (href: string) => {
		if (!storageKey) return;
		const next = selected.includes(href)
			? selected.filter((item) => item !== href)
			: [...selected, href].slice(0, 4);
		setSelection({ key: storageKey, hrefs: next });
		try {
			localStorage.setItem(storageKey, JSON.stringify(next));
		} catch {
			toast.error(
				"Pilihan hanya berlaku selama halaman ini terbuka; penyimpanan browser tidak tersedia.",
			);
		}
	};
	const actions = [
		{ href: "/scan" as const, title: "Scan QR", icon: ScanLine },
		...available.filter((item) => selected.includes(item.href)),
	];
	return (
		<>
			<div
				ref={root}
				className="fixed right-5 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 lg:hidden"
			>
				<div
					id="mobile-quick-links"
					inert={!open}
					aria-hidden={!open}
					className={`absolute right-8 bottom-8 ${open ? "" : "pointer-events-none"}`}
				>
					{[
						...actions,
						{
							href: "settings" as const,
							title: "Atur pintasan",
							icon: Settings2,
						},
					].map((item, index, items) => {
						const { x, y } = quickActionPosition(index, items.length);
						const Icon = item.icon;
						const style = {
							right: -26,
							bottom: -26,
							transform: open
								? `translate(${-x}px, ${-y}px) scale(1)`
								: "translate(0, 0) scale(0.2)",
							opacity: open ? 1 : 0,
							transitionDelay: `${open ? index * 25 : (items.length - index - 1) * 15}ms`,
						};
						const classes =
							"absolute size-[3.25rem] rounded-full border-2 border-primary bg-surface text-primary shadow-lg transition-[transform,opacity,background-color] duration-350 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-primary-soft hover:text-primary-soft-foreground motion-reduce:transition-none";
						return item.href === "settings" ? (
							<Button
								key={item.href}
								size="icon"
								variant="outline"
								style={style}
								className={classes}
								aria-label={item.title}
								title={item.title}
								onClick={() => {
									setOpenPath(null);
									setEditing(true);
								}}
							>
								<Icon className="size-7" aria-hidden="true" />
							</Button>
						) : (
							<Button
								key={item.href}
								render={<Link href={item.href} />}
								size="icon"
								variant="outline"
								style={style}
								className={classes}
								aria-label={item.title}
								title={item.title}
								onClick={() => setOpenPath(null)}
							>
								<Icon className="size-7" aria-hidden="true" />
							</Button>
						);
					})}
				</div>
				<Button
					ref={trigger}
					size="icon"
					className="relative size-16 rounded-full border-2 border-primary shadow-lg"
					aria-label={open ? "Tutup aksi cepat" : "Buka aksi cepat"}
					aria-expanded={open}
					aria-controls="mobile-quick-links"
					onClick={() => setOpenPath(open ? null : pathname)}
				>
					{open ? <X className="size-8" /> : <Menu className="size-8" />}
				</Button>
			</div>
			<ActionDialog
				open={editing}
				onOpenChange={setEditing}
				title="Atur pintasan mobile"
			>
				<p>
					Pilih hingga 4 menu tambahan. Scan QR selalu tersedia. Pilihan
					disimpan untuk akun ini di browser ini.
				</p>
				<div className="flex items-center gap-2 rounded-xl bg-primary-soft p-3 text-primary-soft-foreground">
					<ScanLine className="size-4" /> Scan QR{" "}
					<LockKeyhole className="ml-auto size-4" />
					<span className="sr-only">Pintasan tetap</span>
				</div>
				<div className="space-y-1">
					{available.map((item) => {
						const Icon = item.icon;
						const active = selected.includes(item.href);
						return (
							<Button
								key={item.href}
								variant="ghost"
								aria-pressed={active}
								disabled={!storageKey || (!active && selected.length >= 4)}
								className="min-h-11 w-full justify-start gap-2 rounded-xl px-3"
								onClick={() => toggle(item.href)}
							>
								<Icon />
								{item.title}
								{active && <Check className="ml-auto text-primary" />}
							</Button>
						);
					})}
				</div>
			</ActionDialog>
		</>
	);
}
