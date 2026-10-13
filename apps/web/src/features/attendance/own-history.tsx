"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { trpc } from "@/utils/trpc";
import { eventErrorMessage, formatEventTime, StatusBadge } from "./event-ui";

export default function OwnHistory() {
	const [offset, setOffset] = useState(0);
	const history = useQuery({
		...trpc.attendance.ownHistory.queryOptions({ offset, limit: 25 }),
		retry: false,
	});
	return (
		<section className="space-y-6">
			<div className="space-y-2">
				<h1 className="font-bold text-2xl tracking-tight">
					Riwayat kehadiran saya
				</h1>
				<p className="text-muted-foreground text-sm">
					Event yang mengundang Anda, termasuk yang belum memiliki catatan
					kehadiran.
				</p>
			</div>
			{history.isPending && <p role="status">Memuat riwayat…</p>}
			{history.error && (
				<div className="space-y-3">
					<p role="alert">{eventErrorMessage(history.error)}</p>
					<Button variant="outline" onClick={() => history.refetch()}>
						Coba kembali
					</Button>
				</div>
			)}
			{history.data?.items.length === 0 && (
				<p>Belum ada event dalam riwayat Anda.</p>
			)}
			{history.data?.items.map((item) => (
				<Card key={item.event.id}>
					<CardHeader
						title={item.event.title}
						action={<StatusBadge status={item.presence} />}
					/>
					<CardContent className="space-y-2 text-sm">
						<p>
							Jadwal: {formatEventTime(item.event.startsAt)} –{" "}
							{formatEventTime(item.event.endsAt)}
						</p>
						<p>
							Kehadiran:{" "}
							{item.attendanceAt
								? formatEventTime(item.attendanceAt)
								: "Belum tercatat"}
						</p>
						{item.timingClass && (
							<p>
								{item.timingClass} · {item.lateMinutes} menit setelah toleransi
							</p>
						)}
					</CardContent>
				</Card>
			))}
			<div className="flex gap-3">
				<Button
					variant="outline"
					disabled={offset === 0 || history.isFetching}
					onClick={() => setOffset(Math.max(0, offset - 25))}
				>
					Sebelumnya
				</Button>
				<Button
					variant="outline"
					disabled={history.data?.nextOffset == null || history.isFetching}
					onClick={() => {
						if (history.data?.nextOffset != null)
							setOffset(history.data.nextOffset);
					}}
				>
					Berikutnya
				</Button>
			</div>
		</section>
	);
}
