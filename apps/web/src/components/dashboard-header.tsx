export function DashboardHeader({
	name,
	isSystem = false,
}: {
	name: string;
	isSystem?: boolean;
}) {
	return (
		<header className="hidden flex-wrap items-center justify-between gap-4 border-border border-b pb-4 min-[1200px]:flex">
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">Halo, {name}.</h1>
				<p className="text-muted-foreground text-sm">
					{isSystem
						? "Kelola kegiatan dan akun Senior Resident & Dorm Team."
						: "Ringkasan kinerja, jadwal kegiatan, kepanitiaan, dan pengumuman terkini."}
				</p>
			</div>
			<span className="inline-flex shrink-0 items-center rounded-full border border-border bg-surface px-3 py-1 font-semibold text-muted-foreground text-xs">
				{isSystem ? "Administrator Sistem" : "Portal Operasional RESORA"}
			</span>
		</header>
	);
}
