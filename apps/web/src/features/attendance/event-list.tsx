"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";

export default function EventList() {
	const query = useQuery({
		...trpc.attendance.list.queryOptions(),
		retry: false,
	});
	return (
		<main className="mx-auto max-w-4xl space-y-5 p-6">
			<Link className="focus-ring text-primary underline" href="/dashboard">
				Dashboard
			</Link>
			<h1 className="font-semibold text-2xl">Event internal SR</h1>
			{query.isPending && <p role="status">Memuat event...</p>}
			{query.error && (
				<p role="alert">
					{query.error.message}{" "}
					<Link href="/login?reason=session">Periksa sesi</Link>
				</p>
			)}
			{query.data?.canManage && (
				<Link className="focus-ring text-primary underline" href="/events/new">
					Buat draft event
				</Link>
			)}
			{query.data?.events.length === 0 && <p>Belum ada event yang tersedia.</p>}
			{query.data?.events.map((event) => (
				<Card key={event.id}>
					<CardContent className="space-y-2">
						<Link
							className="focus-ring font-semibold text-primary underline"
							href={`/events/${event.id}`}
						>
							{event.title}
						</Link>
						<p>
							{event.status} ·{" "}
							{new Date(event.startsAt).toLocaleString("id-ID", {
								timeZone: "Asia/Jakarta",
							})}{" "}
							WIB
						</p>
						<p>{event.description}</p>
					</CardContent>
				</Card>
			))}
		</main>
	);
}
