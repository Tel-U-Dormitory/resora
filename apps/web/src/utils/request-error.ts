import { TRPCClientError } from "@trpc/client";

export function queryErrorMessage(error: unknown) {
	if (error instanceof TRPCClientError) {
		if (error.message === "PASSWORD_CHANGE_REQUIRED")
			return "Ganti password terlebih dahulu untuk melanjutkan.";
		if (error.data?.code === "UNAUTHORIZED")
			return "Sesi telah berakhir. Silakan masuk kembali.";
		if (error.data?.code === "FORBIDDEN")
			return "Anda tidak memiliki akses untuk tindakan ini.";
	}
	return "Permintaan belum dapat diproses. Silakan coba kembali.";
}
