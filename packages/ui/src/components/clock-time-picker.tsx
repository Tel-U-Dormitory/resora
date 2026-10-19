"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { TimepickerUI } from "timepicker-ui";
import "timepicker-ui/main.css";
import { Button } from "./button";
import { Input } from "./input";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export function isClockTime(value: string, seconds = false) {
	return (
		seconds ? /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/ : /^([01]\d|2[0-3]):[0-5]\d$/
	).test(value);
}

function ClockFace({
	initialValue,
	seconds,
	label,
	onConfirm,
	onCancel,
}: {
	initialValue: string;
	seconds: boolean;
	label: string;
	onConfirm: (value: string) => void;
	onCancel: () => void;
}) {
	const root = useRef<HTMLDivElement>(null);
	const container = useRef<HTMLDivElement>(null);
	const callbacks = useRef({ onConfirm, onCancel });
	useEffect(() => {
		callbacks.current = { onConfirm, onCancel };
	}, [onConfirm, onCancel]);
	useEffect(() => {
		if (!root.current || !container.current) return;
		const picker = new TimepickerUI(root.current, {
			clock: { type: "24h", showSeconds: seconds },
			ui: {
				inline: {
					enabled: true,
					container: container.current,
					showButtons: true,
					autoUpdate: false,
				},
				viewSwitch: true,
				editable: true,
				animation: !window.matchMedia("(prefers-reduced-motion: reduce)")
					.matches,
			},
			behavior: { focusTrap: false, returnFocus: false },
			labels: {
				ok: "Gunakan waktu",
				cancel: "Batal",
				clockTitle: `${label} · WIB`,
				hour: "Jam",
				minute: "Menit",
				second: "Detik",
				keyboardTitle: "Masukkan waktu",
			},
			callbacks: {
				onConfirm: (data) => {
					const value = [
						data.hour,
						data.minutes,
						...(seconds ? [data.seconds] : []),
					]
						.map((n) => String(n ?? "00").padStart(2, "0"))
						.join(":");
					if (isClockTime(value, seconds)) callbacks.current.onConfirm(value);
				},
				onCancel: () => callbacks.current.onCancel(),
			},
		});
		picker.create();
		picker.setValue(initialValue);
		return () => picker.destroy({ keepInputValue: true });
	}, [initialValue, seconds, label]);
	return (
		<div ref={root} className="resora-clock-picker">
			<input type="hidden" defaultValue={initialValue} />
			<div ref={container} />
		</div>
	);
}

export function ClockTimePicker({
	id,
	label,
	value,
	onChange,
	seconds = false,
	disabled,
	container,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	seconds?: boolean;
	disabled?: boolean;
	container?: HTMLElement;
}) {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState(value);
	const input = useRef<HTMLInputElement>(null);
	useEffect(() => {
		setText(value);
	}, [value]);
	return (
		<div className="relative">
			<Input
				ref={input}
				id={id}
				value={text}
				disabled={disabled}
				required
				aria-label={`${label}: jam (WIB, 24 jam)`}
				placeholder={seconds ? "JJ:MM:DD" : "JJ:MM"}
				maxLength={seconds ? 8 : 5}
				pattern={
					seconds
						? "([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]"
						: "([01][0-9]|2[0-3]):[0-5][0-9]"
				}
				className="pr-12 tabular-nums"
				onChange={(event) => {
					setText(event.target.value);
					if (isClockTime(event.target.value, seconds))
						onChange(event.target.value);
				}}
			/>
			<Popover open={open && !disabled} onOpenChange={setOpen}>
				<PopoverTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							disabled={disabled}
							className="absolute inset-y-0 right-0 h-full w-11 rounded-xl p-0"
							aria-label={`${label}: buka jam analog`}
						/>
					}
				>
					<Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />
				</PopoverTrigger>
				<PopoverContent
					container={container}
					align="start"
					aria-label={`Jam analog ${label}`}
					className="w-auto max-w-[calc(100vw-2rem)] rounded-2xl border border-border p-0 shadow-lg"
				>
					<ClockFace
						initialValue={value}
						seconds={seconds}
						label={label}
						onConfirm={(next) => {
							setText(next);
							onChange(next);
							setOpen(false);
						}}
						onCancel={() => setOpen(false)}
					/>
				</PopoverContent>
			</Popover>
		</div>
	);
}
