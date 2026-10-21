"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { id as localeId } from "react-day-picker/locale";
import { Button } from "./button";
import { Calendar } from "./calendar";
import { ClockTimePicker } from "./clock-time-picker";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function parsePickerDate(value: string) {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!match) return undefined;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	const date = new Date(0);
	date.setFullYear(year, month - 1, day);
	date.setHours(12, 0, 0, 0);
	return date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day
		? date
		: undefined;
}

export function formatPickerDate(date: Date) {
	return [
		String(date.getFullYear()).padStart(4, "0"),
		String(date.getMonth() + 1).padStart(2, "0"),
		String(date.getDate()).padStart(2, "0"),
	].join("-");
}

export function combinePickerDateTime(
	date: string,
	hour: string,
	minute: string,
	second?: string,
) {
	return date
		? `${date}T${hour}:${minute}${second === undefined ? "" : `:${second}`}`
		: "";
}

/** shadcn Calendar/Popover composition; values remain WIB wall time, never host UTC. */
export function DateTimePicker({
	id,
	value,
	onChange,
	disabled,
	required,
	className,
	label = "Tanggal dan waktu",
	seconds = false,
	"aria-invalid": invalid,
	"aria-describedby": describedBy,
}: {
	id: string;
	className?: string;
	label?: string;
	seconds?: boolean;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	required?: boolean;
	"aria-invalid"?: React.AriaAttributes["aria-invalid"];
	"aria-describedby"?: string;
}) {
	const [open, setOpen] = useState(false);
	const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
		null,
	);
	const input = useRef<HTMLInputElement>(null);
	const [date = "", time = "00:00"] = value.split("T");
	const hour = time.slice(0, 2) || "00";
	const minute = time.slice(3, 5) || "00";
	const second = time.slice(6, 8) || "00";
	useEffect(() => {
		setPortalContainer(input.current?.closest("dialog") ?? null);
	}, []);
	const selected = parsePickerDate(date);
	useEffect(() => {
		input.current?.setCustomValidity(
			date && !parsePickerDate(date)
				? "Masukkan tanggal yang valid dengan format YYYY-MM-DD."
				: "",
		);
	}, [date]);
	const update = (
		nextDate: string,
		nextHour = hour,
		nextMinute = minute,
		nextSecond = second,
	) => {
		if (!disabled)
			onChange(
				combinePickerDateTime(
					nextDate,
					nextHour,
					nextMinute,
					seconds ? nextSecond : undefined,
				),
			);
	};
	return (
		<div className="mt-2 space-y-3">
			<div className="relative">
				<Input
					ref={input}
					id={id}
					value={date}
					required={required}
					disabled={disabled}
					aria-invalid={invalid}
					aria-describedby={describedBy}
					placeholder="YYYY-MM-DD"
					maxLength={10}
					pattern="[0-9]{4}-[0-9]{2}-[0-9]{2}"
					className={`pr-12 tabular-nums ${className ?? ""}`}
					onChange={(event) => update(event.target.value)}
				/>
				<Popover open={open && !disabled} onOpenChange={setOpen}>
					<PopoverTrigger
						render={
							<Button
								type="button"
								variant="ghost"
								disabled={disabled}
								className="absolute inset-y-0 right-0 h-full w-11 rounded-xl p-0"
								aria-label={`${label}: pilih tanggal dari kalender`}
							/>
						}
					>
						<CalendarDays
							className="size-4 text-muted-foreground"
							aria-hidden="true"
						/>
					</PopoverTrigger>
					<PopoverContent
						container={portalContainer ?? undefined}
						aria-label={`Kalender ${label}`}
						align="start"
						className="w-auto max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-2 shadow-lg"
					>
						<Calendar
							mode="single"
							locale={localeId}
							selected={selected}
							defaultMonth={selected}
							disabled={disabled}
							onSelect={(next) => {
								if (next) {
									update(formatPickerDate(next));
									setOpen(false);
								}
							}}
							autoFocus
						/>
					</PopoverContent>
				</Popover>
			</div>
			<ClockTimePicker
				id={`${id}-time`}
				label={label}
				value={`${hour}:${minute}${seconds ? `:${second}` : ""}`}
				seconds={seconds}
				disabled={disabled || !selected}
				container={portalContainer ?? undefined}
				onChange={(next) => {
					const [nextHour = "00", nextMinute = "00", nextSecond = "00"] =
						next.split(":");
					update(date, nextHour, nextMinute, nextSecond);
				}}
			/>
		</div>
	);
}
