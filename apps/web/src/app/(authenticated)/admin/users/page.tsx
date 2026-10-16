import AccountList from "@/features/identity/account-list";
import DatabaseBackup from "@/features/identity/database-backup";

export default function AccountListPage() {
	return (
		<div className="space-y-6">
			<AccountList />
			<DatabaseBackup />
		</div>
	);
}
