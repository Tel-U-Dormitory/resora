import { randomUUID } from "node:crypto";
import {
	CopyObjectCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	S3ServiceException,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2StorageConfig = {
	accountId: string;
	accessKeyId: string;
	secretAccessKey: string;
	privateBucket: string;
	publicBucket: string;
	publicBaseUrl: string;
};

export type ObjectMetadata = {
	size: number;
	contentType: string | undefined;
	etag: string | undefined;
};

export type ObjectStorage = {
	createPrivateUploadUrl: (
		key: string,
		contentType: string,
	) => Promise<{
		url: string;
		method: "PUT";
		headers: { "content-type": string; "if-none-match": "*" };
		expiresInSeconds: number;
	}>;
	createPrivateDownloadUrl: (key: string) => Promise<{
		url: string;
		expiresInSeconds: number;
	}>;
	getPrivateObjectMetadata: (
		key: string,
	) => Promise<ObjectMetadata | undefined>;
	getPrivateObjectBytes: (
		key: string,
		maxBytes: number,
	) => Promise<{
		bytes: Uint8Array;
		contentType: string | undefined;
	}>;
	copyPrivateObject: (
		sourceKey: string,
		targetKey: string,
		contentType: string,
	) => Promise<void>;
	copyPrivateObjectToPublic: (input: {
		sourceKey: string;
		targetKey: string;
		contentType: string;
		cacheControl?: string;
	}) => Promise<void>;
	deletePrivateObject: (key: string) => Promise<void>;
	deletePublicObject: (key: string) => Promise<void>;
	getPublicObjectUrl: (key: string) => string;
};

const uploadExpirySeconds = 300;
const downloadExpirySeconds = 60;

function assertObjectKey(key: string) {
	if (
		!key ||
		key.startsWith("/") ||
		key
			.split("/")
			.some((segment) => !segment || segment === "." || segment === "..")
	)
		throw new Error("Invalid object key");
}

function assertContentType(contentType: string) {
	if (!contentType || /[\r\n]/.test(contentType))
		throw new Error("Invalid content type");
}

function encodeKey(key: string) {
	return key.split("/").map(encodeURIComponent).join("/");
}

export function createStorageKey() {
	return randomUUID();
}

export function createR2Storage(config: R2StorageConfig) {
	const publicBaseUrl = new URL(config.publicBaseUrl);
	if (
		publicBaseUrl.protocol !== "https:" ||
		publicBaseUrl.username ||
		publicBaseUrl.password ||
		publicBaseUrl.search ||
		publicBaseUrl.hash ||
		publicBaseUrl.pathname !== "/"
	)
		throw new Error("R2 public base URL must be an HTTPS origin");
	const baseUrl = publicBaseUrl.href.replace(/\/$/, "");
	const client = new S3Client({
		region: "auto",
		endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
		credentials: {
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
		},
	});

	const storage: ObjectStorage = {
		createPrivateUploadUrl: async (key: string, contentType: string) => {
			assertObjectKey(key);
			assertContentType(contentType);
			return {
				url: await getSignedUrl(
					client,
					new PutObjectCommand({
						Bucket: config.privateBucket,
						Key: key,
						ContentType: contentType,
						IfNoneMatch: "*",
					}),
					{ expiresIn: uploadExpirySeconds },
				),
				method: "PUT" as const,
				headers: { "content-type": contentType, "if-none-match": "*" },
				expiresInSeconds: uploadExpirySeconds,
			};
		},
		createPrivateDownloadUrl: async (key: string) => {
			assertObjectKey(key);
			return {
				url: await getSignedUrl(
					client,
					new GetObjectCommand({ Bucket: config.privateBucket, Key: key }),
					{ expiresIn: downloadExpirySeconds },
				),
				expiresInSeconds: downloadExpirySeconds,
			};
		},
		getPrivateObjectMetadata: async (
			key: string,
		): Promise<ObjectMetadata | undefined> => {
			assertObjectKey(key);
			try {
				const result = await client.send(
					new HeadObjectCommand({ Bucket: config.privateBucket, Key: key }),
				);
				if (result.ContentLength === undefined) return;
				return {
					size: result.ContentLength,
					contentType: result.ContentType,
					etag: result.ETag,
				};
			} catch (error) {
				if (
					error instanceof S3ServiceException &&
					(error.name === "NotFound" || error.name === "NoSuchKey")
				)
					return;
				throw error;
			}
		},
		getPrivateObjectBytes: async (key: string, maxBytes: number) => {
			assertObjectKey(key);
			if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
				throw new Error("Invalid object size limit");
			const result = await client.send(
				new GetObjectCommand({ Bucket: config.privateBucket, Key: key }),
			);
			if (
				!result.Body ||
				result.ContentLength === undefined ||
				result.ContentLength > maxBytes
			)
				throw new Error("Object exceeds size limit or has no body");
			const bytes = await result.Body.transformToByteArray();
			if (
				bytes.byteLength !== result.ContentLength ||
				bytes.byteLength > maxBytes
			)
				throw new Error("Object size changed or exceeds limit");
			return { bytes, contentType: result.ContentType };
		},
		copyPrivateObject: async (
			sourceKey: string,
			targetKey: string,
			contentType: string,
		) => {
			assertObjectKey(sourceKey);
			assertObjectKey(targetKey);
			assertContentType(contentType);
			await client.send(
				new CopyObjectCommand({
					Bucket: config.privateBucket,
					Key: targetKey,
					CopySource: `${config.privateBucket}/${encodeKey(sourceKey)}`,
					MetadataDirective: "REPLACE",
					ContentType: contentType,
					ContentDisposition: "inline",
				}),
			);
		},
		copyPrivateObjectToPublic: async (input: {
			sourceKey: string;
			targetKey: string;
			contentType: string;
			cacheControl?: string;
		}) => {
			assertObjectKey(input.sourceKey);
			assertObjectKey(input.targetKey);
			assertContentType(input.contentType);
			await client.send(
				new CopyObjectCommand({
					Bucket: config.publicBucket,
					Key: input.targetKey,
					CopySource: `${config.privateBucket}/${encodeKey(input.sourceKey)}`,
					MetadataDirective: "REPLACE",
					ContentType: input.contentType,
					CacheControl: input.cacheControl,
				}),
			);
		},
		deletePrivateObject: async (key: string) => {
			assertObjectKey(key);
			await client.send(
				new DeleteObjectCommand({ Bucket: config.privateBucket, Key: key }),
			);
		},
		deletePublicObject: async (key: string) => {
			assertObjectKey(key);
			await client.send(
				new DeleteObjectCommand({ Bucket: config.publicBucket, Key: key }),
			);
		},
		getPublicObjectUrl: (key: string) => {
			assertObjectKey(key);
			return `${baseUrl}/${encodeKey(key)}`;
		},
	};
	return storage;
}
