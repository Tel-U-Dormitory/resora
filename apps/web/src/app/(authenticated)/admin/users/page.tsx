import { AccountList, DatabaseBackup } from "@/features/identity/public";

export default function AccountListPage() {
	return (
		<div className="space-y-6">
			<AccountList />
			<DatabaseBackup />
		</div>
	);
}
