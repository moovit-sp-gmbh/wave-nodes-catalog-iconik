/**
 * Upload of a local file into an Iconik storage, used by Upload File. Iconik
 * hands out a signed storage URL per file (POST /files/v1/assets/{id}/files/);
 * how the bytes are sent depends on the storage method. The signed URLs carry
 * storage credentials, so they never appear in an output or error message.
 */
import { constants, createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

/** Storage methods whose signed upload URL this node can write to. */
export const SUPPORTED_STORAGE_METHODS = ["GCS", "S3", "AZURE"] as const;
export type StorageMethod = (typeof SUPPORTED_STORAGE_METHODS)[number];

/** Files up to this size go in one request; larger S3 and Azure files go in parts of at least this size. */
export const PART_SIZE = 100 * 1024 * 1024;
/** S3 accepts at most 10,000 parts per upload. */
export const S3_MAX_PARTS = 10_000;
/** Azure accepts at most 50,000 blocks per blob. */
export const AZURE_MAX_BLOCKS = 50_000;
/** Each part is tried this many times when the storage fails or cannot be reached. */
export const PART_ATTEMPTS = 3;

const FAILED = "Could not upload file";

export interface LocalFile {
    path: string;
    name: string;
    size: number;
    created: Date;
    modified: Date;
}

export interface IconikStorage {
    id?: string;
    name?: string;
    method?: string;
    status?: string;
    [key: string]: unknown;
}

/** The fields of a new file record the upload needs. */
export interface IconikUploadFile {
    id?: string;
    upload_url?: string;
    multipart_upload_url?: string;
    upload_headers?: Record<string, string> | null;
    storage_method?: string;
    [key: string]: unknown;
}

/** One byte range of the file, both ends inclusive, as fs.createReadStream takes them. */
export interface Part {
    number: number;
    start: number;
    end: number;
}

/** What a storage upload needs from the node: cancellation and progress. */
export interface UploadContext {
    signal: AbortSignal;
    isCanceled: () => boolean;
    /** Called with the number of bytes sent so far. */
    onProgress: (sentBytes: number) => void;
}

/** Thrown for a non-2xx answer from the storage; the node turns it into its failure message. */
export class StorageError extends Error {
    constructor(
        readonly status: number,
        readonly storageMessage: string
    ) {
        super(`the storage returned ${status}: ${storageMessage}`);
        this.name = "StorageError";
    }
}

/** Fields of a file record that hold signed storage URLs or credentials. */
const SIGNED_FIELDS = ["upload_url", "multipart_upload_url", "upload_credentials", "upload_headers", "upload_filename", "url"];

/** The file record without its signed upload fields, safe for an output. */
export function publicFileRecord(record: IconikUploadFile): Record<string, unknown> {
    return Object.fromEntries(Object.entries(record).filter(([key]) => !SIGNED_FIELDS.includes(key)));
}

/** Checks File Path: an absolute path to a readable regular file. */
export async function readLocalFile(value: unknown): Promise<LocalFile> {
    const filePath = typeof value === "string" ? value.trim() : "";
    if (filePath.length === 0) {
        throw new Error(`${FAILED} — File Path is empty — enter the absolute path of the file on the Agent's machine`);
    }
    if (!path.isAbsolute(filePath)) {
        throw new Error(`${FAILED} — File Path "${filePath}" is not an absolute path — enter the full path, e.g. /Volumes/Media/clip.mov`);
    }
    let info;
    try {
        info = await stat(filePath);
    } catch {
        throw new Error(`${FAILED} — "${filePath}" does not exist — check File Path and that the Agent's machine can see the file`);
    }
    if (!info.isFile()) {
        throw new Error(`${FAILED} — "${filePath}" is not a file — enter the path of a single file, not a folder`);
    }
    try {
        await access(filePath, constants.R_OK);
    } catch {
        throw new Error(`${FAILED} — "${filePath}" cannot be read — check the file permissions for the user the Agent runs as`);
    }
    return { path: filePath, name: path.basename(filePath), size: info.size, created: info.birthtime, modified: info.mtime };
}

/** Checks the storage's status and method before anything is created in Iconik. */
export function requireStorageMethod(storage: IconikStorage): StorageMethod {
    if (storage.status !== undefined && storage.status !== "ACTIVE") {
        throw new Error(
            `${FAILED} — storage "${storage.name ?? storage.id}" is ${storage.status} in Iconik — activate it or choose another storage in Storage ID`
        );
    }
    const method = (storage.method ?? "").toUpperCase();
    if (!(SUPPORTED_STORAGE_METHODS as readonly string[]).includes(method)) {
        throw new Error(
            `${FAILED} — storage "${storage.name ?? storage.id}" uses method ${method || "unknown"}, which this node cannot upload to — choose a ${SUPPORTED_STORAGE_METHODS.join(", ")} storage in Storage ID`
        );
    }
    return method as StorageMethod;
}

/** The body of POST /files/v1/assets/{id}/files/ for one regular file. */
export function buildFileBody(file: LocalFile, ids: { formatId: string; fileSetId: string; storageId: string }): Record<string, unknown> {
    return {
        original_name: file.name,
        directory_path: "",
        size: file.size,
        type: "FILE",
        format_id: ids.formatId,
        file_set_id: ids.fileSetId,
        storage_id: ids.storageId,
        file_date_created: file.created.toISOString(),
        file_date_modified: file.modified.toISOString(),
    };
}

/** Splits `size` bytes into parts of at least `minPartSize`, growing them so there are never more than `maxParts`. */
export function planParts(size: number, minPartSize: number, maxParts: number): Part[] {
    if (size === 0) return [{ number: 1, start: 0, end: -1 }];
    const partSize = Math.max(minPartSize, Math.ceil(size / maxParts));
    const parts: Part[] = [];
    for (let start = 0, number = 1; start < size; start += partSize, number++) {
        parts.push({ number, start, end: Math.min(size, start + partSize) - 1 });
    }
    return parts;
}

/** The byte count of a part. */
export function partLength(part: Part): number {
    return part.end - part.start + 1;
}

/** Reads the UploadId out of S3's CreateMultipartUpload answer. */
export function extractUploadId(xml: unknown): string {
    const match = typeof xml === "string" ? /<UploadId>([^<]+)<\/UploadId>/.exec(xml) : null;
    if (!match) throw new Error("the storage did not return an upload ID for the multipart upload");
    return match[1];
}

/** The body of S3's CompleteMultipartUpload request. */
export function s3CompleteXml(parts: { number: number; etag: string }[]): string {
    const entries = parts.map((p) => `<Part><PartNumber>${p.number}</PartNumber><ETag>${p.etag}</ETag></Part>`).join("");
    return `<CompleteMultipartUpload>${entries}</CompleteMultipartUpload>`;
}

/** Azure block IDs must be Base64 and all the same length. */
export function azureBlockId(number: number): string {
    return Buffer.from(`block-${String(number).padStart(6, "0")}`).toString("base64");
}

/** The body of Azure's Put Block List request. */
export function azureBlockListXml(blockIds: string[]): string {
    return `<?xml version="1.0" encoding="utf-8"?><BlockList>${blockIds.map((id) => `<Latest>${id}</Latest>`).join("")}</BlockList>`;
}

/** Adds query parameters to a signed URL without disturbing its signature parameters. */
export function withQuery(url: string, query: Record<string, string>): string {
    const extra = new URLSearchParams(query).toString();
    return `${url}${url.includes("?") ? "&" : "?"}${extra}`;
}

/**
 * The storage's own error text: the Code and Message of an S3 or Azure XML
 * error, otherwise the body shortened. Never the request URL, which is signed.
 */
export function extractStorageMessage(data: unknown): string {
    const text = Buffer.isBuffer(data) ? data.toString("utf8") : typeof data === "string" ? data : data ? JSON.stringify(data) : "";
    const code = /<Code>([^<]*)<\/Code>/.exec(text)?.[1];
    const message = /<Message>([^<]*)<\/Message>/.exec(text)?.[1];
    if (code || message) return [code, message?.split("\n")[0]].filter(Boolean).join(": ");
    const trimmed = text.trim();
    if (trimmed.length === 0) return "no error details returned";
    return trimmed.length > 300 ? `${trimmed.slice(0, 300)}…` : trimmed;
}

/** Sends one request to the storage; no timeout, since a part can take minutes, and no redirects, so a body stream is never buffered. */
async function storageRequest(config: AxiosRequestConfig, context: UploadContext): Promise<AxiosResponse> {
    const response = await axios.request({
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        maxRedirects: 0,
        ...config,
        signal: context.signal,
        validateStatus: () => true,
    });
    if (response.status >= 200 && response.status < 300) return response;
    throw new StorageError(response.status, extractStorageMessage(response.data));
}

/** True for failures worth another attempt: the storage was unreachable or answered 5xx or 429. */
function isRetryable(err: unknown): boolean {
    if (err instanceof StorageError) return err.status >= 500 || err.status === 429;
    return !axios.isCancel(err);
}

/** Tracks the bytes sent across parts; a retried part starts its count again. */
class Progress {
    private done = 0;
    constructor(private readonly context: UploadContext) {}

    /** A read stream for one part that reports its bytes as they go out. */
    stream(file: LocalFile, part: Part) {
        let sent = 0;
        // An empty file has no byte range to read.
        const stream =
            part.end >= part.start ? createReadStream(file.path, { start: part.start, end: part.end }) : createReadStream(file.path);
        stream.on("data", (chunk) => {
            sent += chunk.length;
            this.context.onProgress(this.done + sent);
        });
        return stream;
    }

    finish(part: Part): void {
        this.done += Math.max(0, partLength(part));
        this.context.onProgress(this.done);
    }
}

function checkCanceled(context: UploadContext): void {
    if (context.isCanceled()) throw new Error(`${FAILED} — the stream was canceled during the upload — run the stream again`);
}

/** Sends one part, retrying a failed attempt with a fresh read of the same bytes. */
async function sendPart(
    file: LocalFile,
    part: Part,
    progress: Progress,
    context: UploadContext,
    build: (body: NodeJS.ReadableStream) => AxiosRequestConfig
): Promise<AxiosResponse> {
    for (let attempt = 1; ; attempt++) {
        checkCanceled(context);
        try {
            const response = await storageRequest(build(progress.stream(file, part)), context);
            progress.finish(part);
            return response;
        } catch (err: unknown) {
            if (attempt >= PART_ATTEMPTS || !isRetryable(err) || context.isCanceled()) throw err;
        }
    }
}

function headersOf(record: IconikUploadFile, extra: Record<string, string | number>): Record<string, string | number> {
    return { ...(record.upload_headers ?? {}), ...extra };
}

/**
 * Google Cloud Storage: upload_url is a signed resumable-upload URL. The first
 * POST opens the session; the whole file then goes in one PUT to the session URL.
 */
export async function uploadToGcs(file: LocalFile, record: IconikUploadFile, uploadUrl: string, context: UploadContext): Promise<void> {
    // The Content-Type is part of the GCS signature: axios would add application/x-www-form-urlencoded
    // to the empty POST, so it is suppressed unless Iconik asks for one in upload_headers.
    const headers: Record<string, string | number | boolean> = headersOf(record, { "x-goog-resumable": "start", "Content-Length": 0 });
    if (!Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) headers["Content-Type"] = false;
    const start = await storageRequest({ method: "POST", url: uploadUrl, headers }, context);
    const location = start.headers?.["location"] as string | undefined;
    const uploadId = start.headers?.["x-guploader-uploadid"] as string | undefined;
    if (!location && !uploadId) throw new Error("the storage did not open an upload session");
    const sessionUrl = location ?? withQuery(uploadUrl, { upload_id: uploadId as string });
    const whole: Part = { number: 1, start: 0, end: file.size - 1 };
    const progress = new Progress(context);
    await sendPart(file, whole, progress, context, (body) => ({
        method: "PUT",
        url: sessionUrl,
        headers: { "Content-Type": "application/octet-stream", "Content-Length": file.size },
        data: body,
    }));
}

/**
 * Amazon S3: upload_url is a presigned PUT for small files. Larger files use
 * S3 multipart: multipart_upload_url opens it, Iconik signs one URL per part
 * and the completion URL, and a failed upload is aborted through Iconik.
 */
export async function uploadToS3(
    file: LocalFile,
    record: IconikUploadFile,
    uploadUrl: string,
    context: UploadContext,
    iconik: {
        partUrls: (uploadId: string, partCount: number) => Promise<{ number?: number; url?: string }[]>;
        completeUrl: (uploadId: string) => Promise<string>;
        abort: (uploadId: string) => Promise<void>;
    }
): Promise<void> {
    const progress = new Progress(context);
    if (file.size <= PART_SIZE || !record.multipart_upload_url) {
        await sendPart(file, { number: 1, start: 0, end: file.size - 1 }, progress, context, (body) => ({
            method: "PUT",
            url: uploadUrl,
            headers: headersOf(record, { "Content-Length": file.size }),
            data: body,
        }));
        return;
    }

    const opened = await storageRequest({ method: "POST", url: record.multipart_upload_url, responseType: "text" }, context);
    const uploadId = extractUploadId(opened.data);
    try {
        const parts = planParts(file.size, PART_SIZE, S3_MAX_PARTS);
        const urls = new Map((await iconik.partUrls(uploadId, parts.length)).map((u, index) => [u.number ?? index + 1, u.url]));
        const sent: { number: number; etag: string }[] = [];
        for (const part of parts) {
            const url = urls.get(part.number);
            if (!url) throw new Error(`Iconik returned no upload URL for part ${part.number} of ${parts.length}`);
            const response = await sendPart(file, part, progress, context, (body) => ({
                method: "PUT",
                url,
                headers: { "Content-Length": partLength(part) },
                data: body,
            }));
            const etag = response.headers?.["etag"] as string | undefined;
            if (!etag) throw new Error(`the storage returned no ETag for part ${part.number}`);
            sent.push({ number: part.number, etag });
        }
        checkCanceled(context);
        await storageRequest(
            {
                method: "POST",
                url: await iconik.completeUrl(uploadId),
                headers: { "Content-Type": "application/xml" },
                data: s3CompleteXml(sent),
                responseType: "text",
            },
            context
        );
    } catch (err: unknown) {
        await iconik.abort(uploadId).catch(() => undefined);
        throw err;
    }
}

/**
 * Azure Blob Storage: upload_url is a SAS URL for the blob. Small files go in
 * one Put Blob; larger files in blocks committed with Put Block List.
 */
export async function uploadToAzure(file: LocalFile, record: IconikUploadFile, uploadUrl: string, context: UploadContext): Promise<void> {
    const progress = new Progress(context);
    if (file.size <= PART_SIZE) {
        await sendPart(file, { number: 1, start: 0, end: file.size - 1 }, progress, context, (body) => ({
            method: "PUT",
            url: uploadUrl,
            headers: headersOf(record, { "x-ms-blob-type": "BlockBlob", "Content-Length": file.size }),
            data: body,
        }));
        return;
    }
    const parts = planParts(file.size, PART_SIZE, AZURE_MAX_BLOCKS);
    const blockIds: string[] = [];
    for (const part of parts) {
        const blockId = azureBlockId(part.number);
        await sendPart(file, part, progress, context, (body) => ({
            method: "PUT",
            url: withQuery(uploadUrl, { comp: "block", blockid: blockId }),
            headers: { "Content-Length": partLength(part) },
            data: body,
        }));
        blockIds.push(blockId);
    }
    checkCanceled(context);
    await storageRequest(
        {
            method: "PUT",
            url: withQuery(uploadUrl, { comp: "blocklist" }),
            headers: headersOf(record, { "Content-Type": "application/xml" }),
            data: azureBlockListXml(blockIds),
        },
        context
    );
}
