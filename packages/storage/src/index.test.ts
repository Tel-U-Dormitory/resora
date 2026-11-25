import { expect, test } from "bun:test";
import { createR2Storage } from "./index";

test("private upload URL signs the create-once condition and content type", async () => {
	const storage = createR2Storage({
		accountId: "development-account",
		accessKeyId: "synthetic-access-key",
		secretAccessKey: "synthetic-secret-key",
		privateBucket: "resora-private-dev",
		publicBucket: "resora-public-dev",
		publicBaseUrl: "https://media.example.test",
	});
	const upload = await storage.createPrivateUploadUrl(
		"violations/tmp/synthetic-object",
		"image/jpeg",
	);
	const url = new URL(upload.url);

	expect(upload.headers).toEqual({
		"content-type": "image/jpeg",
		"if-none-match": "*",
	});
	expect(url.searchParams.get("X-Amz-SignedHeaders")).toContain(
		"if-none-match",
	);
});
