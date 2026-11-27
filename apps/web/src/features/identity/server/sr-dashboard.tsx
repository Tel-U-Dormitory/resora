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
	LiveDashboardMetrics as DashboardMetrics,
	DashboardPreviewProvider,
} from "@/features/dashboard/public";
import { getSrSession } from "./server-session";

export default async function SrDashboard() {
	const session = await getSrSession();
	if (!session) redirect("/login?reason=session");
	if (session.requiresPasswordChange) redirect("/change-password");
	const isSr = session.actor === "SR";
	const canManageDashboard = session.canManageBroadcast || session.isSuperadmin;
	// Backend KPI modules are not integrated yet; real /dashboard renders all 4 cards as "Segera hadir".
	const previewFixtures = null;
	const actions = [
		...(isSr
			? [
					{
						href: "/scan" as const,
						title: "Scan QR kehadiran",
						shortTitle: "Scan QR",
						icon: ScanLine,
						highlight: true,
					},
					{
						href: "/events" as const,
						title: "Kegiatan",
						shortTitle: "Kegiatan",
						icon: CalendarDays,
						highlight: false,
					},
					{
						href: "/attendance/history" as const,
						title: "Riwayat kehadiran",
						shortTitle: "Riwayat",
						icon: History,
						highlight: false,
					},
				]
			: []),
		...(session.canManageInternalEvents
			? [
					{
						href: "/events?view=manage" as const,
						title: "Kelola kegiatan",
						shortTitle: "Kelola event",
						icon: ListChecks,
						highlight: false,
					},
				]
			: []),
		...(session.isSuperadmin
			? [
					{
						href: "/admin/users" as const,
						title: "Kelola akun SR",
						shortTitle: "Kelola akun",
						icon: Users,
						highlight: false,
					},
					...(isSr
						? []
						: [
								{
									href: "/admin/users/new" as const,
									title: "Tambah akun SR",
									shortTitle: "Tambah akun",
									icon: Plus,
									highlight: true,
								},
							]),
				]
			: []),
	];
	return (
		<section className="resora-page resora-dashboard space-y-5">
			<DashboardHeader
				name={session.name}
				isSystem={session.actor === "SYSTEM_ADMIN"}
			/>
			<DashboardPreviewProvider
				key={session.userId}
				identityKey={session.userId}
				simulateRequests={previewFixtures !== null}
				fixtures={previewFixtures}
				canManage={canManageDashboard}
				initialMode={canManageDashboard ? "management" : "personal"}
			>
				<DashboardMetrics showCleanliness={isSr} />
				<section
					aria-label="Akses cepat"
					className="resora-dashboard-quick resora-dashboard-section space-y-3"
				>
					<div className="flex items-center justify-between gap-2">
						<h2 className="font-bold text-base">Akses cepat</h2>
						<Link
							href="/events"
							className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-primary text-xs hover:underline"
						>
							Semua modul
							<ArrowRight size={14} aria-hidden="true" />
						</Link>
					</div>
					<div className="resora-quick-launchers">
						{actions.map(({ href, title, shortTitle, icon: Icon }, index) => {
							const tone =
								href === "/scan" || href === "/events?view=manage"
									? "coral"
									: href === "/attendance/history"
										? "purple"
										: index === 1 || href === "/events"
											? "yellow"
											: "purple";
							return (
								<Link
									key={href}
									href={href}
									aria-label={title}
									data-tone={tone}
									className={`resora-quick-launcher focus-ring ${href === "/scan" ? "hidden min-[1200px]:flex" : ""}`}
								>
									<span className="resora-quick-circle">
										<Icon size={20} aria-hidden="true" />
									</span>
									<span className="resora-quick-label">{shortTitle}</span>
								</Link>
							);
						})}
					</div>
				</section>
				<div className="resora-dashboard-activities resora-dashboard-section">
					<DashboardActivities personalSr={isSr} />
				</div>
				<div className="resora-dashboard-broadcasts resora-dashboard-section">
					<BroadcastFeed view="LATEST" canManage={session.canManageBroadcast} />
				</div>
			</DashboardPreviewProvider>
			<section aria-label="Modul mendatang" className="sr-only">
				<h2>Modul mendatang</h2>
				<div>
					{[
						{ title: "Penilaian & Analitik", icon: ChartNoAxesCombined },
						{ title: "Pelanggaran", icon: FileWarning },
						{ title: "Kebersihan Kamar", icon: ClipboardCheck },
					].map(({ title, icon: Icon }) => (
						<div key={title}>
							<Icon size={18} aria-hidden="true" />
							<span>{title}</span>
							<span>Segera hadir</span>
						</div>
					))}
				</div>
			</section>
			<details className="sr-only">
				<summary>Informasi akun</summary>
				<p>{isSr ? `NIM: ${session.nim}` : `Username: ${session.username}`}</p>
			</details>
		</section>
	);
}
