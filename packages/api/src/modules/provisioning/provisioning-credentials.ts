import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { encodeCsv, ProvisioningError } from "./provisioning-csv";

const exec = promisify(execFile);
export type InitialCredential = {
	nim: string;
	name: string;
	email: string;
	temporary_password: string;
};
export type InitialSystemCredential = Omit<InitialCredential, "nim"> & {
	username: string;
};
export type ExportState = "PREPARED" | "COMMITTED" | "FAILED" | "UNCONFIRMED";
export type CredentialBundle = {
	path: string;
	mark: (state: ExportState) => Promise<void>;
};

// Restrict only our private directories, never the workspace/global ACLs.
const windowsAcl = `
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
if ($env:RESORA_NEW_PRIVATE_DIRECTORY -eq '1') {
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetAccessRuleProtection($true, $false)
  $acl.SetOwner($sid)
  foreach ($identity in @($sid, $system)) {
    $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new(
      $identity, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow'))
  }
  Set-Acl -LiteralPath $env:RESORA_PRIVATE_DIRECTORY -AclObject $acl
}
$actual = Get-Acl -LiteralPath $env:RESORA_PRIVATE_DIRECTORY
if (!$actual.AreAccessRulesProtected -or $actual.GetOwner([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) {
  throw 'Private directory ownership/protection check failed'
}
foreach ($rule in $actual.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
  if ($rule.IdentityReference.Value -notin @($sid.Value, $system.Value)) {
    throw 'Unexpected private directory access'
  }
}
`;

async function privateDirectory(path: string, exclusive = false) {
	let created = false;
	try {
		await mkdir(path, { mode: 0o700 });
		created = true;
	} catch (error) {
		if (
			exclusive ||
			!(error instanceof Error) ||
			!("code" in error) ||
			error.code !== "EEXIST"
		)
			throw error;
	}
	const stat = await lstat(path);
	if (stat.isSymbolicLink() || !stat.isDirectory())
		throw new Error("Unsafe private directory");
	if (process.platform === "win32") {
		await exec(
			"powershell.exe",
			["-NoProfile", "-NonInteractive", "-Command", windowsAcl],
			{
				windowsHide: true,
				env: {
					...process.env,
					RESORA_PRIVATE_DIRECTORY: path,
					RESORA_NEW_PRIVATE_DIRECTORY: created ? "1" : "0",
				},
			},
		);
	} else if (stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0) {
		throw new Error("Unsafe private directory permissions");
	}
}

async function durableWrite(path: string, content: string) {
	const file = await open(path, "wx", 0o600);
	try {
		await file.writeFile(content, "utf8");
		await file.sync();
	} finally {
		await file.close();
	}
}

async function syncDirectory(path: string) {
	if (process.platform === "win32") return; // Windows file fsync + NTFS; directory fsync is unavailable.
	const directory = await open(path, "r");
	try {
		await directory.sync();
	} finally {
		await directory.close();
	}
}

export async function prepareCredentials(
	projectRoot: string,
	records: readonly (InitialCredential | InitialSystemCredential)[],
): Promise<CredentialBundle> {
	try {
		const root = await realpath(projectRoot);
		const systemExport = records.some((row) => "username" in row);
		if (systemExport && records.some((row) => !("username" in row)))
			throw new Error("Mixed credential identity types");
		const base = join(
			root,
			".private",
			systemExport ? "system-admin-bootstrap" : "sr-provisioning",
		);
		await exec(
			"git",
			[
				"check-ignore",
				"--quiet",
				"--no-index",
				"--",
				join(base, "credentials.csv"),
			],
			{ cwd: root, windowsHide: true },
		);
		await privateDirectory(join(root, ".private"));
		await privateDirectory(base);
		const directory = join(base, randomUUID());
		await privateDirectory(directory, true);
		await syncDirectory(base);
		const path = join(directory, "credentials.csv");
		const csv = encodeCsv([
			[
				systemExport ? "username" : "nim",
				"name",
				"email",
				"temporary_password",
			],
			...records.map((row) => [
				"username" in row ? row.username : row.nim,
				row.name,
				row.email,
				row.temporary_password,
			]),
		]);
		const metadata = {
			count: records.length,
			sha256: createHash("sha256").update(csv).digest("hex"),
		};
		const mark = async (state: ExportState) => {
			const temporary = join(directory, `${randomUUID()}.tmp`);
			try {
				await durableWrite(
					temporary,
					`${JSON.stringify({ ...metadata, state })}\n`,
				);
				await rename(temporary, join(directory, "status.json"));
				await syncDirectory(directory);
			} finally {
				await unlink(temporary).catch(() => {});
			}
		};
		await mark("PREPARED");
		try {
			await durableWrite(path, csv);
			await syncDirectory(directory);
		} catch (error) {
			await mark("FAILED").catch(() => {});
			throw error;
		}
		return { path, mark };
	} catch {
		// Never expose filesystem/child-process details containing personal data.
		throw new ProvisioningError("CREDENTIAL_EXPORT_FAILED");
	}
}
