"use client";

import { DateTimePicker } from "@resora/ui/components/date-time-picker";

import { CalendarDays } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import {
	formatEventSchedule,
	parseWibDateTimeInput,
} from "../../../components/event-feedback";

import { type DraftEditorView, fieldClass } from "./form-model";
export function ScheduleFields({ view }: { view: DraftEditorView }) {
	const {
		start,
		setStart,
		end,
		setEnd,
		fullEditing,
		endError,
		setEndError,
		saving,
		invalidFieldId,
	} = view;
	return (
		<Card>
			<div className="border-border border-b p-5">
				<h2 className="flex items-center gap-2 font-semibold text-base">
					<CalendarDays
						className="size-4 text-muted-foreground"
						aria-hidden="true"
					/>{" "}
					Jadwal
				</h2>
				<p className="mt-1 text-muted-foreground text-sm">
					Isi waktu mulai dan selesai dalam WIB.
				</p>
			</div>
			<CardContent className="grid gap-4 sm:grid-cols-2">
				{fullEditing && (
					<div className="text-sm">
						<label htmlFor="event-start" className="font-medium">
							Waktu mulai (WIB)
						</label>
						<DateTimePicker
							label="Waktu mulai"
							id="event-start"
							aria-invalid={invalidFieldId === "event-start" || undefined}
							required
							disabled={saving}
							className={fieldClass}
							value={start}
							onChange={(value) => {
								setStart(value);
								setEndError("");
							}}
						/>
					</div>
				)}
				<div className="text-sm">
					<label htmlFor="event-end" className="font-medium">
						Waktu selesai (WIB)
					</label>
					<DateTimePicker
						label="Waktu selesai"
						required
						disabled={saving}
						id="event-end"
						aria-invalid={Boolean(endError) || invalidFieldId === "event-end"}
						aria-describedby={endError ? "event-end-error" : undefined}
						className={fieldClass}
						value={end}
						onChange={(value) => {
							setEnd(value);
							setEndError("");
						}}
					/>
					{endError && (
						<p
							id="event-end-error"
							className="mt-2 text-destructive text-sm"
							role="alert"
						>
							{endError}
						</p>
					)}
				</div>
				{Number.isFinite(parseWibDateTimeInput(start).getTime()) &&
					Number.isFinite(parseWibDateTimeInput(end).getTime()) &&
					parseWibDateTimeInput(end) > parseWibDateTimeInput(start) && (
						<p className="text-muted-foreground text-xs sm:col-span-2">
							{formatEventSchedule(
								parseWibDateTimeInput(start).toISOString(),
								parseWibDateTimeInput(end).toISOString(),
							)}
						</p>
					)}
			</CardContent>
		</Card>
	);
}
