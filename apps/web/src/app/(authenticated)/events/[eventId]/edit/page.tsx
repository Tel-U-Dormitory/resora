import { EventForm } from "@/features/events/public";
export default async function EditEventPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	return <EventForm eventId={eventId} />;
}
