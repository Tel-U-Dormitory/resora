import { buttonVariants } from "@resora/ui/components/button";
import { Card, CardContent } from "@resora/ui/components/card";
import {
	ArrowRight,
	CalendarDays,
	History,
	ListChecks,
	Plus,
	ScanLine,
	Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { cn } from "@/lib/utils";
import BroadcastFeed from "../broadcast/broadcast-feed";
import { getSrSession } from "./server-session";

export default async function SrDashboard() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	const isSr = session.actor === "SR";
	const actions = [
		...(isSr
			? [
					{
						href: "/events" as const,
						title: "Event internal",
						icon: CalendarDays,
					},
					{
						href: "/attendance/history" as const,
						title: "Riwayat kehadiran",
						icon: History,
					},
				]
			: []),
		...(session.canManageInternalEvents
			? [
					{
						href: "/events?view=manage" as const,
						title: "Kelola event",
						icon: ListChecks,
					},
				]
			: []),
		...(session.isSuperadmin
			? [
					{
						href: "/admin/users" as const,
						title: "Kelola akun SR",
						icon: Users,
					},
				]
			: []),
	];
	return (
		<section className="resora-page space-y-8">
			<DashboardHeader
				name={session.name}
				isSystem={session.actor === "SYSTEM_ADMIN"}
			/>
			<BroadcastFeed view="LATEST" canManage={session.canManageBroadcast} />
			{(isSr || session.isSuperadmin) && (
				<Card className="resora-panel resora-feature-panel">
					<CardContent className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
						<div className="flex items-start gap-4">
							<span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-surface text-primary shadow-sm">
								{isSr ? (
									<ScanLine size={24} aria-hidden="true" />
								) : (
									<Users size={24} aria-hidden="true" />
								)}
							</span>
							<div className="space-y-1">
								<h2 className="font-semibold text-lg">
									{isSr
										? "Siap mengikuti kegiatan?"
										: "Manajemen Senior Resident"}
								</h2>
								<p className="max-w-md text-muted-foreground text-sm">
									{isSr
										? "Pindai QR di lokasi kegiatan untuk mencatat kehadiran Anda."
										: "Buat akun untuk memberikan akses kepada Senior Resident."}
								</p>
							</div>
						</div>
						<Link
							href={isSr ? "/scan" : "/admin/users/new"}
							className={cn(
								buttonVariants(),
								"resora-primary-action w-full sm:w-auto",
							)}
						>
							{isSr ? (
								<ScanLine aria-hidden="true" />
							) : (
								<Plus aria-hidden="true" />
							)}
							{isSr ? "Scan QR kehadiran" : "Tambah akun SR"}
							<ArrowRight data-action-arrow aria-hidden="true" />
						</Link>
					</CardContent>
				</Card>
			)}
			<div className="space-y-3">
				<h2 className="font-semibold text-sm">Ruang kerja Anda</h2>
				<div className="grid gap-4 sm:grid-cols-2">
					{actions.map(({ href, title, icon: Icon }) => (
						<Card
							key={href}
							className="resora-panel resora-action-card relative"
						>
							<CardContent>
								<Link
									href={href}
									className="focus-ring group flex items-center gap-4 rounded-lg after:absolute after:inset-0 after:rounded-2xl"
								>
									<span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
										<Icon size={22} aria-hidden="true" />
									</span>
									<span className="font-semibold text-sm">{title}</span>
									<ArrowRight
										size={18}
										data-action-arrow
										className="ml-auto shrink-0 text-muted-foreground"
										aria-hidden="true"
									/>
								</Link>
							</CardContent>
						</Card>
					))}
				</div>
			</div>
			<details className="text-sm">
				<summary className="focus-ring w-fit cursor-pointer rounded-lg py-3 text-muted-foreground">
					Informasi akun
				</summary>
				<p className="mt-1">
					{isSr ? `NIM: ${session.nim}` : `Username: ${session.username}`}
				</p>
			</details>
		</section>
	);
}
