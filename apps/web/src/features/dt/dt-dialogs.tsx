"use client";

import type { AppRouter } from "@resora/api/routers/index";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@resora/ui/components/dialog";
import { Input } from "@resora/ui/components/input";
import { Label } from "@resora/ui/components/label";
import { Select } from "@resora/ui/components/select";
import { Textarea } from "@resora/ui/components/textarea";
import type { inferRouterOutputs } from "@trpc/server";
import { Check, Copy, X } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { dtErrorMessage } from "./dt-ui";

export type DtMemberItem =
	inferRouterOutputs<AppRouter>["dt"]["list"]["items"][number];
export type DtReferences = inferRouterOutputs<AppRouter>["dt"]["references"];
export type DtIssuedCredentials =
	inferRouterOutputs<AppRouter>["dt"]["activate"];

function DtDialogFrame({
	title,
	description,
	busy = false,
	onClose,
	children,
}: {
	title: string;
	description: string;
	busy?: boolean;
	onClose: () => void;
	children: ReactNode;
}) {
	const titleRef = useRef<HTMLHeadingElement>(null);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) onClose();
			}}
		>
			<DialogContent
				className="resora-admin-dialog max-h-[90dvh] overflow-y-auto"
				initialFocus={titleRef}
			>
				<div className="flex items-start justify-between gap-3">
					<DialogTitle
						ref={titleRef}
						tabIndex={-1}
						className="font-semibold text-xl outline-none"
					>
						{title}
					</DialogTitle>
					<Button
						type="button"
						variant="outline"
						size="icon"
						aria-label="Tutup dialog"
						disabled={busy}
						onClick={onClose}
						className="size-10 shrink-0 rounded-full"
					>
						<X size={16} aria-hidden="true" />
					</Button>
				</div>
				<DialogDescription className="mt-1.5 text-muted-foreground text-sm">
					{description}
				</DialogDescription>
				<div className="mt-5">{children}</div>
			</DialogContent>
		</Dialog>
	);
}

export function DtCredentialsDialog({
	title,
	subtitle,
	credentials,
	onClose,
}: {
	title: string;
	subtitle: string;
	credentials: DtIssuedCredentials;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState(false);
	const [copyNote, setCopyNote] = useState("");
	return (
		<DtDialogFrame title={title} description={subtitle} onClose={onClose}>
			<div className="space-y-4">
				<dl className="grid gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-sm sm:grid-cols-2">
					<div>
						<dt className="text-muted-foreground text-xs">Nama</dt>
						<dd className="font-semibold">{credentials.name}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground text-xs">NIM (Username)</dt>
						<dd className="font-mono font-semibold">{credentials.nim}</dd>
					</div>
					<div className="sm:col-span-2">
						<dt className="text-muted-foreground text-xs">Email</dt>
						<dd className="break-all font-medium">{credentials.email}</dd>
					</div>
				</dl>
				<div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-4">
					<Label htmlFor="dt-temp-password">
						Password sementara (tampil sekali)
					</Label>
					<div className="flex flex-wrap items-center gap-2">
						<Input
							id="dt-temp-password"
							value={credentials.temporaryPassword}
							readOnly
							autoComplete="off"
							spellCheck={false}
							className="min-w-0 flex-1 font-mono"
						/>
						<Button
							type="button"
							variant="outline"
							leftIcon={
								copied ? (
									<Check size={16} aria-hidden="true" />
								) : (
									<Copy size={16} aria-hidden="true" />
								)
							}
							onClick={async () => {
								try {
									await navigator.clipboard.writeText(
										credentials.temporaryPassword,
									);
									setCopied(true);
									setCopyNote(
										"Password disalin. Berikan secara privat kepada anggota DT.",
									);
								} catch {
									setCopyNote(
										"Tidak dapat menyalin otomatis. Salin password secara manual.",
									);
								}
							}}
						>
							{copied ? "Tersalin" : "Salin"}
						</Button>
					</div>
					{copyNote && (
						<p role="status" className="text-muted-foreground text-xs">
							{copyNote}
						</p>
					)}
				</div>
				<p className="text-muted-foreground text-xs leading-relaxed">
					Simpan password ini sebelum menutup dialog. Password tidak disimpan
					dalam bentuk teks biasa dan tidak dapat dilihat kembali.
				</p>
				<div className="flex justify-end">
					<Button onClick={onClose}>Selesai</Button>
				</div>
			</div>
		</DtDialogFrame>
	);
}

export function RegisterCandidateDialog({
	references,
	onClose,
	onSubmit,
}: {
	references: DtReferences;
	onClose: () => void;
	onSubmit: (values: {
		name: string;
		nim: string;
		email: string;
		periodName: string;
		departmentCode: string | null;
		buildingId: string | null;
		workProgram: string | null;
		registrationNotes: string;
	}) => Promise<unknown>;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [name, setName] = useState("");
	const [nim, setNim] = useState("");
	const [email, setEmail] = useState("");
	const [periodName, setPeriodName] = useState("2026/2027");
	const [departmentCode, setDepartmentCode] = useState("");
	const [buildingId, setBuildingId] = useState("");
	const [workProgram, setWorkProgram] = useState("");
	const [notes, setNotes] = useState("");

	return (
		<DtDialogFrame
			title="Daftarkan calon anggota DT"
			description="Calon mahasiswa belum bisa login sampai ditinjau dan diaktifkan oleh Departemen Adaptif."
			busy={busy}
			onClose={onClose}
		>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					if (busy) return;
					setBusy(true);
					setError("");
					try {
						await onSubmit({
							name: name.trim(),
							nim: nim.trim(),
							email: email.trim(),
							periodName: periodName.trim(),
							departmentCode: departmentCode || null,
							buildingId: buildingId || null,
							workProgram: workProgram.trim() || null,
							registrationNotes: notes.trim(),
						});
						onClose();
					} catch (err) {
						setError(dtErrorMessage(err));
					} finally {
						setBusy(false);
					}
				}}
			>
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-danger/30 bg-[var(--danger-tint)] p-3 text-danger text-sm"
					>
						{error}
					</p>
				)}
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="dt-reg-name">Nama lengkap</Label>
						<Input
							id="dt-reg-name"
							required
							maxLength={120}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-reg-nim">NIM</Label>
						<Input
							id="dt-reg-nim"
							required
							maxLength={64}
							value={nim}
							onChange={(e) => setNim(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-reg-email">Email</Label>
						<Input
							id="dt-reg-email"
							type="email"
							required
							maxLength={255}
							value={email}
							onChange={(e) => setEmail(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-reg-period">Periode kepengurusan</Label>
						<Input
							id="dt-reg-period"
							required
							maxLength={100}
							value={periodName}
							onChange={(e) => setPeriodName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-reg-dept">Departemen pembina (opsional)</Label>
						<Select
							id="dt-reg-dept"
							value={departmentCode}
							onChange={(e) => setDepartmentCode(e.target.value)}
						>
							<option value="">Belum ditentukan</option>
							{references.departments.map((d) => (
								<option key={d.code} value={d.code}>
									{d.name}
								</option>
							))}
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-reg-bldg">Gedung tugas (opsional)</Label>
						<Select
							id="dt-reg-bldg"
							value={buildingId}
							onChange={(e) => setBuildingId(e.target.value)}
						>
							<option value="">Belum ditentukan</option>
							{references.buildings.map((b) => (
								<option key={b.id} value={b.id}>
									{b.name}
								</option>
							))}
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-reg-proker">Program kerja (opsional)</Label>
						<Input
							id="dt-reg-proker"
							maxLength={200}
							placeholder="Contoh: Pendampingan Orientasi Maba"
							value={workProgram}
							onChange={(e) => setWorkProgram(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="dt-reg-notes">Catatan pendaftaran (opsional)</Label>
						<Textarea
							id="dt-reg-notes"
							rows={3}
							maxLength={500}
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
						/>
					</div>
				</div>
				<div className="flex flex-wrap justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onClose}
					>
						Batal
					</Button>
					<Button type="submit" loading={busy}>
						Daftarkan calon
					</Button>
				</div>
			</form>
		</DtDialogFrame>
	);
}

export function ActivateMembershipDialog({
	member,
	references,
	onClose,
	onActivate,
}: {
	member: DtMemberItem;
	references: DtReferences;
	onClose: () => void;
	onActivate: (values: {
		membershipId: string;
		periodName: string;
		startsOn: string;
		endsOn: string;
		departmentCode: string | null;
		buildingId: string | null;
		workProgram: string | null;
		reason: string;
	}) => Promise<DtIssuedCredentials>;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [periodName, setPeriodName] = useState(member.periodName);
	const [startsOn, setStartsOn] = useState(
		new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta" }).format(
			new Date(),
		),
	);
	const [endsOn, setEndsOn] = useState("");
	const [departmentCode, setDepartmentCode] = useState(
		member.departmentCode ?? "",
	);
	const [buildingId, setBuildingId] = useState(member.buildingId ?? "");
	const [workProgram, setWorkProgram] = useState(member.workProgram ?? "");
	const [reason, setReason] = useState("Disetujui dan diaktifkan oleh Adaptif");

	return (
		<DtDialogFrame
			title="Aktifkan anggota DT"
			description={`Tetapkan masa berlaku dan penugasan untuk ${member.name} (${member.nim}).`}
			busy={busy}
			onClose={onClose}
		>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					if (busy) return;
					setBusy(true);
					setError("");
					try {
						await onActivate({
							membershipId: member.id,
							periodName: periodName.trim(),
							startsOn,
							endsOn,
							departmentCode: departmentCode || null,
							buildingId: buildingId || null,
							workProgram: workProgram.trim() || null,
							reason: reason.trim(),
						});
					} catch (err) {
						setError(dtErrorMessage(err));
					} finally {
						setBusy(false);
					}
				}}
			>
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-danger/30 bg-[var(--danger-tint)] p-3 text-danger text-sm"
					>
						{error}
					</p>
				)}
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="dt-act-period">Label periode</Label>
						<Input
							id="dt-act-period"
							required
							maxLength={100}
							value={periodName}
							onChange={(e) => setPeriodName(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-act-start">Tanggal mulai</Label>
						<Input
							id="dt-act-start"
							type="date"
							required
							value={startsOn}
							onChange={(e) => setStartsOn(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-act-end">Tanggal berakhir</Label>
						<Input
							id="dt-act-end"
							type="date"
							required
							value={endsOn}
							onChange={(e) => setEndsOn(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-act-dept">Departemen pembina</Label>
						<Select
							id="dt-act-dept"
							value={departmentCode}
							onChange={(e) => setDepartmentCode(e.target.value)}
						>
							<option value="">Belum ditentukan</option>
							{references.departments.map((d) => (
								<option key={d.code} value={d.code}>
									{d.name}
								</option>
							))}
						</Select>
					</div>
					<div className="space-y-1.5">
						<Label htmlFor="dt-act-bldg">Gedung tugas</Label>
						<Select
							id="dt-act-bldg"
							value={buildingId}
							onChange={(e) => setBuildingId(e.target.value)}
						>
							<option value="">Belum ditentukan</option>
							{references.buildings.map((b) => (
								<option key={b.id} value={b.id}>
									{b.name}
								</option>
							))}
						</Select>
					</div>
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="dt-act-proker">Program kerja</Label>
						<Input
							id="dt-act-proker"
							maxLength={200}
							value={workProgram}
							onChange={(e) => setWorkProgram(e.target.value)}
						/>
					</div>
					<div className="space-y-1.5 sm:col-span-2">
						<Label htmlFor="dt-act-reason">Catatan / alasan keputusan</Label>
						<Input
							id="dt-act-reason"
							required
							maxLength={500}
							value={reason}
							onChange={(e) => setReason(e.target.value)}
						/>
					</div>
				</div>
				<div className="flex flex-wrap justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onClose}
					>
						Batal
					</Button>
					<Button type="submit" loading={busy}>
						Aktifkan & buat password
					</Button>
				</div>
			</form>
		</DtDialogFrame>
	);
}

export function UpdateAssignmentDialog({
	member,
	references,
	onClose,
	onSubmit,
}: {
	member: DtMemberItem;
	references: DtReferences;
	onClose: () => void;
	onSubmit: (values: {
		membershipId: string;
		departmentCode: string | null;
		buildingId: string | null;
		workProgram: string | null;
		reason: string;
	}) => Promise<unknown>;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [departmentCode, setDepartmentCode] = useState(
		member.departmentCode ?? "",
	);
	const [buildingId, setBuildingId] = useState(member.buildingId ?? "");
	const [workProgram, setWorkProgram] = useState(member.workProgram ?? "");
	const [reason, setReason] = useState("");

	return (
		<DtDialogFrame
			title="Kelola penugasan DT"
			description={`Perbarui penugasan untuk ${member.name} (${member.nim}). Perubahan dicatat ke riwayat dan audit.`}
			busy={busy}
			onClose={onClose}
		>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					if (busy) return;
					setBusy(true);
					setError("");
					try {
						await onSubmit({
							membershipId: member.id,
							departmentCode: departmentCode || null,
							buildingId: buildingId || null,
							workProgram: workProgram.trim() || null,
							reason: reason.trim(),
						});
						onClose();
					} catch (err) {
						setError(dtErrorMessage(err));
					} finally {
						setBusy(false);
					}
				}}
			>
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-danger/30 bg-[var(--danger-tint)] p-3 text-danger text-sm"
					>
						{error}
					</p>
				)}
				<div className="space-y-1.5">
					<Label htmlFor="dt-assign-dept">Departemen pembina</Label>
					<Select
						id="dt-assign-dept"
						value={departmentCode}
						onChange={(e) => setDepartmentCode(e.target.value)}
					>
						<option value="">Belum ditentukan</option>
						{references.departments.map((d) => (
							<option key={d.code} value={d.code}>
								{d.name}
							</option>
						))}
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="dt-assign-bldg">Gedung tugas</Label>
					<Select
						id="dt-assign-bldg"
						value={buildingId}
						onChange={(e) => setBuildingId(e.target.value)}
					>
						<option value="">Belum ditentukan</option>
						{references.buildings.map((b) => (
							<option key={b.id} value={b.id}>
								{b.name}
							</option>
						))}
					</Select>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="dt-assign-proker">Program kerja</Label>
					<Input
						id="dt-assign-proker"
						maxLength={200}
						value={workProgram}
						onChange={(e) => setWorkProgram(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="dt-assign-reason">Alasan perubahan (wajib)</Label>
					<Textarea
						id="dt-assign-reason"
						required
						rows={3}
						maxLength={500}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</div>
				<div className="flex flex-wrap justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onClose}
					>
						Batal
					</Button>
					<Button type="submit" loading={busy}>
						Simpan penugasan
					</Button>
				</div>
			</form>
		</DtDialogFrame>
	);
}

export function ExtendPeriodDialog({
	member,
	onClose,
	onSubmit,
}: {
	member: DtMemberItem;
	onClose: () => void;
	onSubmit: (values: {
		membershipId: string;
		endsOn: string;
		periodName?: string;
		reason: string;
	}) => Promise<unknown>;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [periodName, setPeriodName] = useState(member.periodName);
	const [endsOn, setEndsOn] = useState(member.endsOn ?? "");
	const [reason, setReason] = useState("");

	return (
		<DtDialogFrame
			title="Perpanjang periode DT"
			description={`Periode saat ini berakhir pada ${member.endsOn ?? "—"}.`}
			busy={busy}
			onClose={onClose}
		>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					if (busy) return;
					setBusy(true);
					setError("");
					try {
						await onSubmit({
							membershipId: member.id,
							endsOn,
							periodName: periodName.trim() || undefined,
							reason: reason.trim(),
						});
						onClose();
					} catch (err) {
						setError(dtErrorMessage(err));
					} finally {
						setBusy(false);
					}
				}}
			>
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-danger/30 bg-[var(--danger-tint)] p-3 text-danger text-sm"
					>
						{error}
					</p>
				)}
				<div className="space-y-1.5">
					<Label htmlFor="dt-ext-period">Label periode</Label>
					<Input
						id="dt-ext-period"
						required
						maxLength={100}
						value={periodName}
						onChange={(e) => setPeriodName(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="dt-ext-end">Tanggal berakhir baru</Label>
					<Input
						id="dt-ext-end"
						type="date"
						required
						value={endsOn}
						onChange={(e) => setEndsOn(e.target.value)}
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="dt-ext-reason">Alasan perpanjangan (wajib)</Label>
					<Textarea
						id="dt-ext-reason"
						required
						rows={3}
						maxLength={500}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</div>
				<div className="flex flex-wrap justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onClose}
					>
						Batal
					</Button>
					<Button type="submit" loading={busy}>
						Perpanjang periode
					</Button>
				</div>
			</form>
		</DtDialogFrame>
	);
}

export function ReasonConfirmDialog({
	title,
	description,
	submitLabel,
	variant = "primary",
	defaultReason = "",
	requireReason = true,
	onClose,
	onSubmit,
}: {
	title: string;
	description: string;
	submitLabel: string;
	variant?: "primary" | "danger";
	defaultReason?: string;
	requireReason?: boolean;
	onClose: () => void;
	onSubmit: (reason: string) => Promise<unknown>;
}) {
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [reason, setReason] = useState(defaultReason);

	return (
		<DtDialogFrame
			title={title}
			description={description}
			busy={busy}
			onClose={onClose}
		>
			<form
				className="space-y-4"
				onSubmit={async (event) => {
					event.preventDefault();
					if (busy) return;
					setBusy(true);
					setError("");
					try {
						await onSubmit(reason.trim());
						onClose();
					} catch (err) {
						setError(dtErrorMessage(err));
					} finally {
						setBusy(false);
					}
				}}
			>
				{error && (
					<p
						role="alert"
						className="rounded-xl border border-danger/30 bg-[var(--danger-tint)] p-3 text-danger text-sm"
					>
						{error}
					</p>
				)}
				<div className="space-y-1.5">
					<Label htmlFor="dt-confirm-reason">
						Alasan {requireReason ? "(wajib)" : "(opsional)"}
					</Label>
					<Textarea
						id="dt-confirm-reason"
						required={requireReason}
						rows={3}
						maxLength={500}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</div>
				<div className="flex flex-wrap justify-end gap-2 pt-2">
					<Button
						type="button"
						variant="outline"
						disabled={busy}
						onClick={onClose}
					>
						Batal
					</Button>
					<Button type="submit" variant={variant} loading={busy}>
						{submitLabel}
					</Button>
				</div>
			</form>
		</DtDialogFrame>
	);
}
