import { EventForm } from "@/features/events/public";
export default async function NewEventPage({
	searchParams,
}: {
	searchParams: Promise<{ scope?: string }>;
}) {
	const { scope } = await searchParams;
	return <EventForm dtOnlyScope={scope === "dt"} />;
}
