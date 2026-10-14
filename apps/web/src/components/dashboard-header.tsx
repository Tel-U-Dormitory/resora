export function DashboardHeader({ isSystem = false }: { isSystem?: boolean }) {
	return (
		<div className="space-y-2">
			<p className="font-semibold text-primary text-xs uppercase tracking-wider">
				RESORA / Dashboard
			</p>
			<h1 className="font-bold text-2xl tracking-tight">
				{isSystem ? "Dashboard SUPERADMIN" : "Dashboard SR"}
			</h1>
			<p className="text-muted-foreground text-sm">
				{isSystem
					? "Administrasi akun dan operasional RESORA."
					: "Selamat datang di area Senior Resident."}
			</p>
		</div>
	);
}
