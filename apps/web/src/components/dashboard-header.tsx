export function DashboardHeader({
	name,
	isSystem = false,
}: {
	name: string;
	isSystem?: boolean;
}) {
	return (
		<div className="space-y-2">
			<h1 className="font-bold text-2xl tracking-tight">
				Selamat datang, {name}.
			</h1>
			<p className="text-muted-foreground text-sm">
				{isSystem
					? "Kelola kegiatan dan akun Senior Resident."
					: "Akses kegiatan dan kehadiran Anda."}
			</p>
		</div>
	);
}
