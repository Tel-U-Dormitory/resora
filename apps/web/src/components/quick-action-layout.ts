// Includes the settings control alongside the one to five navigation shortcuts.
export function quickActionPosition(index: number, count: number) {
	const radius = Math.max(104, (count - 1) * 40);
	const span = Math.min(Math.PI / 2, Math.max(0, count - 1) * 0.58);
	const angle =
		Math.PI / 4 - span / 2 + (count > 1 ? (index * span) / (count - 1) : 0);
	return {
		x: Math.round(Math.cos(angle) * radius),
		y: Math.round(Math.sin(angle) * radius),
	};
}
