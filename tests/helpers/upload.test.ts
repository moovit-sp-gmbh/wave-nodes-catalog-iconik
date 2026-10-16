import { mkdtemp, rm, truncate, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import axios, { AxiosRequestConfig } from "axios";
import {
    PART_SIZE,
    StorageError,
    UploadContext,
    azureBlockId,
    azureBlockListXml,
    buildFileBody,
    extractStorageMessage,
    extractUploadId,
    planParts,
    publicFileRecord,
    readLocalFile,
    requireStorageMethod,
    s3CompleteXml,
    uploadToAzure,
    uploadToGcs,
    uploadToS3,
    withQuery,
} from "../../lib/helpers/upload";

function reply(status: number, data: unknown = "", headers: Record<string, string> = {}) {
    return { status, data, headers, statusText: "", config: {} };
}

function context(): UploadContext & { progress: number[] } {
    const progress: number[] = [];
    return { signal: new AbortController().signal, isCanceled: () => false, onProgress: (b) => progress.push(b), progress };
}

/** Reads a request body stream so the bytes count as sent. */
async function drain(config: AxiosRequestConfig): Promise<number> {
    let bytes = 0;
    if (config.data instanceof Readable) for await (const chunk of config.data) bytes += (chunk as Buffer).length;
    return bytes;
}

let dir: string;
beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "iconik-upload-"));
});
afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe("planParts", () => {
    it("splits a file into parts of the minimum size with a shorter last part", () => {
        expect(planParts(250, 100, 10)).toEqual([
            { number: 1, start: 0, end: 99 },
            { number: 2, start: 100, end: 199 },
            { number: 3, start: 200, end: 249 },
        ]);
    });

    it("grows the parts so their number stays within the limit", () => {
        const parts = planParts(1000, 10, 4);
        expect(parts).toHaveLength(4);
        expect(parts[0]).toEqual({ number: 1, start: 0, end: 249 });
        expect(parts[3].end).toBe(999);
    });

    it("returns one empty part for an empty file", () => {
        expect(planParts(0, 100, 10)).toEqual([{ number: 1, start: 0, end: -1 }]);
    });
});

describe("request bodies and parsing", () => {
    it("reads the S3 UploadId and builds the completion body", () => {
        expect(extractUploadId("<InitiateMultipartUploadResult><UploadId>abc.123</UploadId></InitiateMultipartUploadResult>")).toBe(
            "abc.123"
        );
        expect(() => extractUploadId("<Error/>")).toThrow("did not return an upload ID");
        expect(s3CompleteXml([{ number: 1, etag: '"e1"' }])).toBe(
            '<CompleteMultipartUpload><Part><PartNumber>1</PartNumber><ETag>"e1"</ETag></Part></CompleteMultipartUpload>'
        );
    });

    it("builds Azure block IDs of equal length and the block list", () => {
        expect(azureBlockId(1)).toHaveLength(azureBlockId(1234).length);
        expect(azureBlockListXml(["a", "b"])).toContain("<BlockList><Latest>a</Latest><Latest>b</Latest></BlockList>");
    });

    it("appends query parameters to a signed URL", () => {
        expect(withQuery("https://x.blob.core.windows.net/c/b?sv=1&sig=s", { comp: "block" })).toBe(
            "https://x.blob.core.windows.net/c/b?sv=1&sig=s&comp=block"
        );
        expect(withQuery("https://x/b", { comp: "blocklist" })).toBe("https://x/b?comp=blocklist");
    });

    it("keeps only the storage's error code and message", () => {
        expect(extractStorageMessage("<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>")).toBe(
            "AccessDenied: Access Denied"
        );
        expect(extractStorageMessage("")).toBe("no error details returned");
        expect(extractStorageMessage("x".repeat(400))).toHaveLength(301);
    });

    it("drops the signed fields from a file record", () => {
        expect(publicFileRecord({ id: "f", status: "CLOSED", upload_url: "https://signed", upload_credentials: {} })).toEqual({
            id: "f",
            status: "CLOSED",
        });
    });

    it("builds the file body from the local file", () => {
        const date = new Date("2026-01-02T03:04:05.000Z");
        const body = buildFileBody(
            { path: "/a/clip.mov", name: "clip.mov", size: 5, created: date, modified: date },
            { formatId: "f", fileSetId: "s", storageId: "st" }
        );
        expect(body).toEqual({
            original_name: "clip.mov",
            directory_path: "",
            size: 5,
            type: "FILE",
            format_id: "f",
            file_set_id: "s",
            storage_id: "st",
            file_date_created: "2026-01-02T03:04:05.000Z",
            file_date_modified: "2026-01-02T03:04:05.000Z",
        });
    });

    it("accepts GCS, S3 and Azure storages only", () => {
        expect(requireStorageMethod({ method: "gcs" })).toBe("GCS");
        expect(() => requireStorageMethod({ name: "Archive", method: "B2" })).toThrow(
            'storage "Archive" uses method B2, which this node cannot upload to'
        );
    });
});

describe("readLocalFile", () => {
    it("returns name and size of a readable file", async () => {
        const filePath = path.join(dir, "clip.mov");
        await writeFile(filePath, "hello");
        expect(await readLocalFile(` ${filePath} `)).toMatchObject({ path: filePath, name: "clip.mov", size: 5 });
    });

    it.each([
        ["", /File Path is empty/],
        ["relative/clip.mov", /is not an absolute path/],
        ["/does/not/exist.mov", /does not exist/],
    ])("rejects %p", async (value, message) => {
        await expect(readLocalFile(value)).rejects.toThrow(message);
    });

    it("rejects a folder", async () => {
        const folder = path.join(dir, "folder");
        await mkdir(folder, { recursive: true });
        await expect(readLocalFile(folder)).rejects.toThrow(/is not a file/);
    });
});

describe("storage uploads", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    async function localFile(name: string, size: number) {
        const filePath = path.join(dir, name);
        await writeFile(filePath, "");
        await truncate(filePath, size);
        return readLocalFile(filePath);
    }

    it("opens a GCS resumable session and puts the whole file to it", async () => {
        const file = await localFile("small.bin", 1024);
        let putBytes = 0;
        request.mockImplementation(async (config: AxiosRequestConfig) => {
            if (config.method === "POST") return reply(201, "", { location: "https://storage.googleapis.com/session/1" });
            putBytes = await drain(config);
            return reply(200);
        });
        const ctx = context();

        await uploadToGcs(file, {}, "https://storage.googleapis.com/b/o?X-Goog-Signature=s", ctx);

        const [start, put] = request.mock.calls.map((c) => c[0] as AxiosRequestConfig);
        expect(start.headers).toMatchObject({ "x-goog-resumable": "start", "Content-Type": false });
        expect(put.url).toBe("https://storage.googleapis.com/session/1");
        expect(putBytes).toBe(1024);
        expect(ctx.progress[ctx.progress.length - 1]).toBe(1024);
    });

    it("sends the Content-Type Iconik signed into the GCS start request", async () => {
        const file = await localFile("signed.bin", 16);
        request.mockImplementation(async (config: AxiosRequestConfig) => {
            if (config.method === "POST") return reply(201, "", { location: "https://storage.googleapis.com/session/2" });
            await drain(config);
            return reply(200);
        });

        await uploadToGcs(
            file,
            { upload_headers: { "content-type": "video/mp4" } },
            "https://storage.googleapis.com/b/o?X-Goog-Signature=s",
            context()
        );

        const start = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(start.headers).toEqual({ "content-type": "video/mp4", "x-goog-resumable": "start", "Content-Length": 0 });
    });

    it("uploads a large S3 file in parts, retrying a failed part, and completes it", async () => {
        const file = await localFile("large.bin", PART_SIZE * 2 + 10);
        const putCount = new Map<string, number>();
        request.mockImplementation(async (config: AxiosRequestConfig) => {
            if (config.url === "https://s3/init") return reply(200, "<UploadId>up-1</UploadId>");
            if (config.url === "https://s3/complete") return reply(200, "<CompleteMultipartUploadResult/>");
            await drain(config);
            const seen = (putCount.get(config.url as string) ?? 0) + 1;
            putCount.set(config.url as string, seen);
            if (config.url === "https://s3/part/2" && seen === 1) return reply(503, "<Error><Code>SlowDown</Code></Error>");
            return reply(200, "", { etag: `"etag-${config.url?.slice(-1)}"` });
        });
        const iconik = {
            partUrls: jest.fn(async (_id: string, count: number) =>
                Array.from({ length: count }, (_, i) => ({ number: i + 1, url: `https://s3/part/${i + 1}` }))
            ),
            completeUrl: jest.fn(async () => "https://s3/complete"),
            abort: jest.fn(async () => undefined),
        };

        await uploadToS3(file, { multipart_upload_url: "https://s3/init" }, "https://s3/single", context(), iconik);

        expect(iconik.partUrls).toHaveBeenCalledWith("up-1", 3);
        expect(putCount.get("https://s3/part/2")).toBe(2);
        const complete = request.mock.calls.map((c) => c[0] as AxiosRequestConfig).find((c) => c.url === "https://s3/complete");
        expect(complete?.data).toContain('<PartNumber>3</PartNumber><ETag>"etag-3"</ETag>');
        expect(iconik.abort).not.toHaveBeenCalled();
    });

    it("aborts the S3 multipart upload when a part keeps failing", async () => {
        const file = await localFile("failing.bin", PART_SIZE + 1);
        request.mockImplementation(async (config: AxiosRequestConfig) => {
            if (config.url === "https://s3/init") return reply(200, "<UploadId>up-2</UploadId>");
            await drain(config);
            return reply(403, "<Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>");
        });
        const iconik = {
            partUrls: async () => [
                { number: 1, url: "https://s3/p1" },
                { number: 2, url: "https://s3/p2" },
            ],
            completeUrl: async () => "https://s3/complete",
            abort: jest.fn(async () => undefined),
        };

        const failure = uploadToS3(file, { multipart_upload_url: "https://s3/init" }, "https://s3/single", context(), iconik);

        await expect(failure).rejects.toThrow(new StorageError(403, "AccessDenied: Access Denied"));
        expect(iconik.abort).toHaveBeenCalledWith("up-2");
    });

    it("puts a small file to S3 in one request", async () => {
        const file = await localFile("tiny.bin", 3);
        request.mockImplementation(async (config: AxiosRequestConfig) => {
            await drain(config);
            return reply(200);
        });

        await uploadToS3(file, { multipart_upload_url: "https://s3/init" }, "https://s3/single", context(), {
            partUrls: async () => [],
            completeUrl: async () => "",
            abort: async () => undefined,
        });

        expect(request).toHaveBeenCalledTimes(1);
        expect((request.mock.calls[0][0] as AxiosRequestConfig).url).toBe("https://s3/single");
    });

    it("uploads a large Azure file in blocks and commits the block list", async () => {
        const file = await localFile("azure.bin", PART_SIZE + 5);
        request.mockImplementation(async (config: AxiosRequestConfig) => {
            await drain(config);
            return reply(201);
        });

        await uploadToAzure(file, {}, "https://acct.blob.core.windows.net/c/b?sig=s", context());

        const urls = request.mock.calls.map((c) => (c[0] as AxiosRequestConfig).url);
        expect(urls).toEqual([
            `https://acct.blob.core.windows.net/c/b?sig=s&comp=block&blockid=${encodeURIComponent(azureBlockId(1))}`,
            `https://acct.blob.core.windows.net/c/b?sig=s&comp=block&blockid=${encodeURIComponent(azureBlockId(2))}`,
            "https://acct.blob.core.windows.net/c/b?sig=s&comp=blocklist",
        ]);
    });

    it("stops before the next part when the stream is canceled", async () => {
        const file = await localFile("cancel.bin", PART_SIZE + 5);
        let canceled = false;
        request.mockImplementation(async (config: AxiosRequestConfig) => {
            await drain(config);
            canceled = true;
            return reply(201);
        });

        const failure = uploadToAzure(file, {}, "https://acct/c/b?sig=s", { ...context(), isCanceled: () => canceled });

        await expect(failure).rejects.toThrow("the stream was canceled during the upload");
        expect(request).toHaveBeenCalledTimes(1);
    });
});
