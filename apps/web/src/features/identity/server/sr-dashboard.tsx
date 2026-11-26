import { buttonVariants } from "@resora/ui/components/button";
import { Card, CardContent } from "@resora/ui/components/card";
import {
	ArrowRight,
	CalendarDays,
	ChartNoAxesCombined,
	ClipboardCheck,
	FileWarning,
	History,
	ListChecks,
	Plus,
	ScanLine,
	Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard-header";
import { BroadcastFeed } from "@/features/broadcast/public";
import {
	DashboardActivities,
	DashboardMetrics,
	DashboardPreviewProvider,
	getDashboardPreviewFixtures,
} from "@/features/dashboard/public";
import { cn } from "@/lib/utils";
import { getSrSession } from "./server-session";

export default async function SrDashboard() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	const isSr = session.actor === "SR";
	const canManageDashboard = session.canManageBroadcast || session.isSuperadmin;
	const previewFixtures = await getDashboardPreviewFixtures(canManageDashboard);
	const actions = [
		...(isSr
			? [
					{
						href: "/events" as const,
						title: "Kegiatan",
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
						title: "Kelola kegiatan",
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
		<section className="resora-page resora-dashboard space-y-6">
			<DashboardHeader
				name={session.name}
				isSystem={session.actor === "SYSTEM_ADMIN"}
			/>
			<DashboardPreviewProvider
				key={session.userId}
				fixtures={previewFixtures}
				canManage={canManageDashboard}
				initialMode={canManageDashboard ? "management" : "personal"}
			>
				<DashboardMetrics showCleanliness={isSr} />
				<div className="resora-dashboard-broadcasts">
					<BroadcastFeed view="LATEST" canManage={session.canManageBroadcast} />
				</div>
				<div className="resora-dashboard-activities">
					<DashboardActivities personalSr={isSr} />
				</div>
				<section
					aria-label="Akses cepat"
					className="resora-dashboard-quick space-y-3"
				>
					<h2 className="font-semibold text-lg">Akses cepat</h2>
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
										<h3 className="font-semibold text-lg">
											{isSr ? "Absen kegiatan" : "Manajemen Senior Resident"}
										</h3>
										<p className="max-w-md text-muted-foreground text-sm">
											{isSr
												? "Scan QR di lokasi kegiatan untuk mencatat kehadiran kamu."
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
									<span className="min-w-0 break-words">
										{isSr ? "Scan QR kehadiran" : "Tambah akun SR"}
									</span>
									<ArrowRight data-action-arrow aria-hidden="true" />
								</Link>
							</CardContent>
						</Card>
					)}
					<div className="grid gap-3 sm:grid-cols-2 min-[1200px]:grid-cols-4">
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
				</section>
			</DashboardPreviewProvider>
			<section aria-label="Modul mendatang" className="space-y-3">
				<h2 className="font-semibold text-lg">Modul mendatang</h2>
				<p className="text-muted-foreground text-sm">
					Modul berikut sedang direncanakan dan belum bisa digunakan.
				</p>
				<div className="resora-dashboard-upcoming grid gap-3">
					{[
						{ title: "Penilaian & Analitik", icon: ChartNoAxesCombined },
						{ title: "Pelanggaran", icon: FileWarning },
						{ title: "Kebersihan Kamar", icon: ClipboardCheck },
					].map(({ title, icon: Icon }) => (
						<Card key={title} className="resora-panel">
							<CardContent className="flex items-start gap-3 p-4">
								<Icon
									size={22}
									aria-hidden="true"
									className="shrink-0 text-muted-foreground"
								/>
								<div className="min-w-0 space-y-1">
									<h3 className="font-semibold text-sm">{title}</h3>
									<p className="text-muted-foreground text-sm">Segera hadir</p>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			</section>
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
