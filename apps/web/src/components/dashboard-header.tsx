export function DashboardHeader({
	name,
	isSystem = false,
}: {
	name: string;
	isSystem?: boolean;
}) {
	return (
		<header className="hidden space-y-2 min-[1200px]:block">
			<h1 className="font-bold text-2xl tracking-tight">Halo, {name}.</h1>
			<p className="text-muted-foreground text-sm">
				{isSystem
					? "Kelola kegiatan dan akun Senior Resident."
					: "Lihat ringkasan, pengumuman, dan jadwal kegiatan kamu."}
			</p>
		</header>
	);
}
