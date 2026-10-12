import EventForm from "@/features/attendance/event-form";
export default async function EditEventPage({
	params,
}: {
	params: Promise<{ eventId: string }>;
}) {
	const { eventId } = await params;
	return <EventForm eventId={eventId} />;
}
