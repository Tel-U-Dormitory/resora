import {
	ArrowRight,
	CalendarDays,
	Check,
	History,
	MapPin,
	QrCode,
	ShieldCheck,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/header";
import { Card, CardContent } from "@/components/ui/card";

const features = [
	{
		title: "Event internal",
		description:
			"Temukan kegiatan yang mengundang Anda, lihat jadwal, dan baca detail event sebelum hadir.",
		icon: CalendarDays,
	},
	{
		title: "Absensi QR",
		description:
			"Lakukan check-in menggunakan QR event dan verifikasi lokasi untuk mencatat kehadiran Anda.",
		icon: QrCode,
	},
	{
		title: "Riwayat kehadiran",
		description:
			"Pantau status kehadiran pribadi, waktu check-in, dan klasifikasi ketepatan waktu dalam satu tempat.",
		icon: History,
	},
] as const;
const steps = [
	{ title: "Masuk", description: "Gunakan NIM dan password akun SR Anda." },
	{ title: "Lihat event", description: "Buka kegiatan yang mengundang Anda." },
	{
		title: "Check-in QR",
		description: "Pindai QR dan izinkan verifikasi lokasi.",
	},
	{
		title: "Pantau riwayat",
		description: "Lihat catatan kehadiran pribadi Anda.",
	},
] as const;

export default function LandingPage() {
	return (
		<>
			<Header />
			<main>
				<section
					className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-16 lg:py-28"
					aria-labelledby="hero-title"
				>
					<div>
						<p className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary-soft px-4 py-2 font-semibold text-primary-soft-foreground text-xs">
							<ShieldCheck size={16} aria-hidden="true" />
							Platform Senior Resident
						</p>
						<h1
							id="hero-title"
							className="mt-6 max-w-xl font-bold text-4xl leading-tight tracking-tight sm:text-5xl lg:text-6xl"
						>
							Kelola kegiatan dan kehadiran SR dalam satu tempat.
						</h1>
						<p className="mt-6 max-w-lg text-lg text-muted-foreground leading-relaxed">
							RESORA membantu Senior Resident Telkom University menemukan
							kegiatan, mencatat kehadiran, dan memantau riwayat pribadi dengan
							lebih mudah.
						</p>
						<div className="mt-8 flex flex-wrap items-center gap-3">
							<Link
								href="/login"
								className="focus-ring inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground text-sm shadow-sm transition-colors hover:bg-primary-hover"
							>
								Masuk sebagai SR
								<ArrowRight size={18} aria-hidden="true" />
							</Link>
							<a
								href="#fitur"
								className="focus-ring inline-flex items-center justify-center rounded-lg border border-border bg-surface px-6 py-3 font-semibold text-sm transition-colors hover:bg-muted"
							>
								Jelajahi fitur
							</a>
						</div>
						<p className="mt-5 text-muted-foreground text-sm">
							Akses internal untuk akun SR yang telah disediakan.
						</p>
					</div>
					<figure
						className="min-w-0 rounded-2xl border border-border bg-muted/50 p-3 sm:p-5"
						aria-label="Ilustrasi fitur RESORA"
					>
						<div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
							<div className="flex flex-wrap items-center justify-between gap-3 border-border border-b px-5 py-4">
								<span className="flex items-center gap-2 font-bold tracking-tight">
									<Image
										src="/Logo-Teldorm.png"
										alt=""
										width={937}
										height={1024}
										className="h-10 w-auto shrink-0 object-contain"
									/>
									RESORA<span className="text-primary">.</span>
								</span>
								<span className="rounded-full bg-primary-soft px-3 py-1 font-semibold text-primary-soft-foreground text-xs">
									Ruang kegiatan SR
								</span>
							</div>
							<div className="space-y-4 p-5 sm:p-6">
								<div>
									<p className="font-semibold text-lg">
										Kegiatan dan kehadiran
									</p>
									<p className="mt-1 text-muted-foreground text-sm">
										Dari undangan hingga catatan pribadi.
									</p>
								</div>
								<div className="rounded-xl border border-border p-4">
									<div className="flex items-center gap-3">
										<span className="rounded-lg bg-primary-soft p-2 text-primary">
											<CalendarDays size={22} aria-hidden="true" />
										</span>
										<div>
											<p className="font-semibold">Undangan event internal</p>
											<p className="text-muted-foreground text-xs">
												Jadwal dan detail kegiatan
											</p>
										</div>
									</div>
									<div className="mt-4 flex flex-wrap gap-2">
										<span className="rounded-md bg-muted px-3 py-1.5 text-muted-foreground text-xs">
											Lihat jadwal
										</span>
										<span className="rounded-md bg-muted px-3 py-1.5 text-muted-foreground text-xs">
											Kenali peserta undangan
										</span>
									</div>
								</div>
								<div className="grid gap-3 sm:grid-cols-2">
									<div className="rounded-xl border border-primary/20 bg-primary-soft p-4 text-primary-soft-foreground">
										<QrCode size={36} aria-hidden="true" />
										<p className="mt-3 font-semibold">Check-in QR</p>
										<p className="mt-1 flex items-center gap-1 text-xs">
											<MapPin size={14} aria-hidden="true" />
											Verifikasi lokasi saat hadir
										</p>
									</div>
									<div className="rounded-xl border border-border p-4">
										<History
											size={28}
											className="text-primary"
											aria-hidden="true"
										/>
										<p className="mt-4 font-semibold">Riwayat pribadi</p>
										<p className="mt-1 text-muted-foreground text-xs">
											Status dan waktu kehadiran
										</p>
									</div>
								</div>
							</div>
						</div>
						<figcaption className="mt-3 text-center text-muted-foreground text-xs">
							Ilustrasi fitur — bukan data akun atau kehadiran.
						</figcaption>
					</figure>
				</section>
				<section
					id="fitur"
					aria-labelledby="features-title"
					className="scroll-mt-24 border-border border-y bg-surface py-16 sm:py-20"
				>
					<div className="mx-auto max-w-7xl px-4 sm:px-6">
						<p className="font-semibold text-primary text-sm">
							Terhubung dalam satu platform
						</p>
						<h2
							id="features-title"
							className="mt-2 font-bold text-3xl tracking-tight"
						>
							Fokus pada kegiatan, lebih mudah mengelola kehadiran.
						</h2>
						<div className="mt-8 grid gap-5 md:grid-cols-3">
							{features.map(({ title, description, icon: Icon }) => (
								<Card key={title}>
									<CardContent className="p-6">
										<span className="inline-flex rounded-xl bg-primary-soft p-3 text-primary">
											<Icon size={24} aria-hidden="true" />
										</span>
										<h3 className="mt-5 font-bold text-lg">{title}</h3>
										<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
											{description}
										</p>
									</CardContent>
								</Card>
							))}
						</div>
					</div>
				</section>
				<section
					aria-labelledby="steps-title"
					className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20"
				>
					<h2 id="steps-title" className="font-bold text-3xl tracking-tight">
						Alur sederhana untuk setiap kegiatan.
					</h2>
					<p className="mt-3 text-muted-foreground">
						Mulai dari akun SR Anda, sampai ke catatan kehadiran.
					</p>
					<ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
						{steps.map(({ title, description }, index) => (
							<li key={title} className="border-border border-t pt-5">
								<span className="font-bold text-primary text-sm">
									0{index + 1}
								</span>
								<h3 className="mt-3 font-bold text-lg">{title}</h3>
								<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
									{description}
								</p>
							</li>
						))}
					</ol>
					<p className="mt-10 flex items-start gap-2 text-muted-foreground text-sm">
						<Check
							className="mt-0.5 size-4 shrink-0 text-primary"
							aria-hidden="true"
						/>
						Riwayat pribadi dapat diakses oleh pemilik akun. Pengelolaan event
						tetap mengikuti izin masing-masing SR.
					</p>
				</section>
			</main>
			<footer className="border-border border-t bg-surface">
				<div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between">
					<Link
						href="/"
						className="focus-ring flex w-fit items-center gap-2.5 rounded-md font-bold tracking-tight"
					>
						<Image
							src="/Logo-Teldorm.png"
							alt=""
							width={937}
							height={1024}
							className="h-12 w-auto shrink-0 object-contain"
						/>
						RESORA
					</Link>
					<p className="max-w-lg text-muted-foreground text-sm">
						Platform internal manajemen asrama untuk Senior Resident Telkom
						University.
					</p>
				</div>
			</footer>
		</>
	);
}
