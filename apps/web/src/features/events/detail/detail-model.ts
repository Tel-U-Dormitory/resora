"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { attendanceQueryKeys, queryClient, trpc } from "@/utils/trpc";
import { eventErrorMessage } from "../../../components/event-feedback";
import { refreshAttendanceQueries } from "../../../utils/internal-event-queries";
import { participantPage } from "../../../utils/participant-page";

export const administrativeLabels = {
	HIDE: "Sembunyikan event",
	UNHIDE: "Tampilkan event kembali",
	ARCHIVE: "Arsipkan event",
	RESTORE: "Pulihkan dari arsip",
	DELETE_DRAFT: "Hapus draft permanen",
} as const;
export type AdministrativeAction = keyof typeof administrativeLabels;
export function useEventDetail(eventId: string) {
	const router = useRouter();
	const actionLock = useRef(false);
	const [activeAction, setActiveAction] = useState<string | null>(null);
	const [feedback, setFeedback] = useState("");
	const [invitationToggle, setInvitationToggle] = useState<{
		eventId: string;
		status: string;
		open: boolean;
	} | null>(null);
	const [invitationSearch, setInvitationSearch] = useState("");
	const [invitationPage, setInvitationPage] = useState(1);
	const publish = useMutation(trpc.attendance.publish.mutationOptions());
	const close = useMutation(trpc.attendance.close.mutationOptions());
	const detail = useQuery({
		...trpc.attendance.detail.queryOptions({ eventId }),
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const canManage = detail.data?.canManage ?? false;
	const preview = useQuery({
		...trpc.attendance.preview.queryOptions({ eventId }),
		enabled:
			canManage &&
			detail.data?.event.status === "DRAFT" &&
			!activeAction &&
			!publish.isSuccess,
		retry: false,
		meta: { errorHandledLocally: true },
	});
	const qr = useQuery({
		...trpc.attendance.qr.queryOptions({ eventId }),
		enabled:
			canManage &&
			detail.data?.session.status === "ACTIVE" &&
			!activeAction &&
			!close.isSuccess,
		retry: false,
		meta: { errorHandledLocally: true },
		refetchInterval: 15_000,
	});
	const activate = useMutation(trpc.attendance.activate.mutationOptions());
	const revoke = useMutation(trpc.attendance.revokeQr.mutationOptions());
	const reissue = useMutation(trpc.attendance.reissueQr.mutationOptions());
	const metadata = useMutation(trpc.attendance.editMetadata.mutationOptions());
	const visibility = useMutation(
		trpc.attendance.setVisibility.mutationOptions(),
	);
	const deleteDraft = useMutation(
		trpc.attendance.deleteDraft.mutationOptions(),
	);
	const [administrativeAction, setAdministrativeAction] = useState<
		AdministrativeAction | ""
	>("");
	const [administrativeReason, setAdministrativeReason] = useState("");
	const [error, setError] = useState("");
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	const act = async (
		action: string,
		message: string,
		operation: () => Promise<unknown>,
	) => {
		if (actionLock.current) return;
		actionLock.current = true;
		setActiveAction(action);
		setError("");
		setFeedback("");
		try {
			await Promise.all([
				queryClient.cancelQueries({ queryKey: attendanceQueryKeys.preview }),
				queryClient.cancelQueries({ queryKey: attendanceQueryKeys.qr }),
			]);
			await operation();
		} catch (cause) {
			setError(eventErrorMessage(cause));
			actionLock.current = false;
			setActiveAction(null);
			return;
		}
		setFeedback(message);
		try {
			if (action === "deleteDraft") {
				await queryClient.invalidateQueries({
					queryKey: attendanceQueryKeys.all,
					refetchType: "none",
				});
				router.replace("/events?view=manage");
				return;
			}
			if (["activate", "revoke", "reissue", "close"].includes(action))
				await queryClient.resetQueries({
					queryKey: trpc.attendance.qr.queryKey({ eventId }),
				});
			await refreshAttendanceQueries(queryClient, attendanceQueryKeys);
		} catch {
			setFeedback(`${message} Tampilan belum diperbarui; muat ulang halaman.`);
		} finally {
			actionLock.current = false;
			setActiveAction(null);
		}
	};
	return {
		eventId,
		router,
		actionLock,
		activeAction,
		setActiveAction,
		feedback,
		setFeedback,
		invitationToggle,
		setInvitationToggle,
		invitationSearch,
		setInvitationSearch,
		invitationPage,
		setInvitationPage,
		publish,
		close,
		detail,
		canManage,
		preview,
		qr,
		activate,
		revoke,
		reissue,
		metadata,
		visibility,
		deleteDraft,
		administrativeAction,
		setAdministrativeAction,
		administrativeReason,
		setAdministrativeReason,
		error,
		setError,
		now,
		setNow,
		act,
	};
}
export type EventDetailState = ReturnType<typeof useEventDetail>;
export function createDetailView(
	state: EventDetailState,
	data: NonNullable<EventDetailState["detail"]["data"]>,
) {
	const {
		eventId,
		activeAction,
		invitationToggle,
		invitationSearch,
		invitationPage,
		publish,
		close,
		preview,
		qr,
		activate,
		revoke,
		reissue,
		metadata,
		visibility,
		deleteDraft,
		now,
	} = state;
	const { event, session, participants } = data;
	const administration = data.administration;
	const administrativeOptions = administration
		? [
				...administration.visibilityActions,
				...(administration.canDeleteDraft ? ["DELETE_DRAFT" as const] : []),
			]
		: [];
	const busy =
		(close.isSuccess && event.status !== "CLOSED") ||
		deleteDraft.isSuccess ||
		Boolean(activeAction) ||
		publish.isPending ||
		activate.isPending ||
		close.isPending ||
		revoke.isPending ||
		reissue.isPending ||
		metadata.isPending ||
		visibility.isPending ||
		deleteDraft.isPending;
	const expiry = qr.data?.expiresAt
		? new Date(qr.data.expiresAt).getTime()
		: null;
	const qrUsable =
		qr.data?.state === "ACTIVE" && expiry !== null && now < expiry;
	const qrState =
		qr.data?.state === "ACTIVE" && !qrUsable ? "EXPIRED" : qr.data?.state;
	const invited =
		event.status === "DRAFT" ? preview.data?.participants : participants;
	const invitationsOpen =
		invitationToggle?.eventId === eventId &&
		invitationToggle.status === event.status
			? invitationToggle.open
			: event.status === "DRAFT";
	const visibleInvitations = participantPage<
		NonNullable<typeof invited>[number]
	>(invited ?? [], invitationSearch, invitationPage);
	return {
		...state,
		data,
		event,
		session,
		participants,
		administration,
		administrativeOptions,
		busy,
		expiry,
		qrUsable,
		qrState,
		invited,
		invitationsOpen,
		visibleInvitations,
	};
}
export type EventDetailView = ReturnType<typeof createDetailView>;
