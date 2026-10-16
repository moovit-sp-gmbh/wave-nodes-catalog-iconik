import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import axios, { AxiosRequestConfig } from "axios";
import UploadFile from "../../lib/nodes/iconikFiles/UploadFile";

const ASSET_ID = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const STORAGE_ID = "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const COLLECTION_ID = "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const AUTH_TOKEN = "secret-token-value";
const SIGNATURE = "SIGNED-STORAGE-SECRET";
const API = "https://app.iconik.io/API";

let dir: string;
let filePath: string;
beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "iconik-upload-node-"));
    filePath = path.join(dir, "Interview_Raw_01.mov");
    await writeFile(filePath, "hello iconik");
});
afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = {
        "App ID": "app-id-value",
        "Auth Token": AUTH_TOKEN,
        "File Path": filePath,
        ...overrides,
    };
    const node = new UploadFile();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
        logger: { updateProgressAndMessage: () => undefined },
    } as unknown as UploadFile["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown = "", headers: Record<string, string> = {}) {
    return { status, data, headers, statusText: "", config: {} };
}

/** A fake Iconik on a GCS storage; `storageStatus` is what the storage answers to the file PUT. */
function fakeIconik(
    options: { method?: string; storageStatus?: number; storageState?: string; closeStatus?: number; assetWithoutId?: boolean } = {}
) {
    const uploaded: string[] = [];
    return {
        uploaded,
        handler: async (config: AxiosRequestConfig) => {
            const key = `${config.method} ${config.url}`;
            if (key === `GET ${API}/files/v1/storages/matching/FILES/` || key === `GET ${API}/files/v1/storages/${STORAGE_ID}/`)
                return reply(200, {
                    id: STORAGE_ID,
                    name: "Iconik Storage",
                    method: options.method ?? "GCS",
                    status: options.storageState ?? "ACTIVE",
                });
            if (key === `POST ${API}/assets/v1/assets/`)
                return reply(201, { id: options.assetWithoutId ? undefined : ASSET_ID, title: (config.data as { title: string }).title });
            if (key === `POST ${API}/files/v1/assets/${ASSET_ID}/formats/`) return reply(201, { id: "format-1", name: "ORIGINAL" });
            if (key === `POST ${API}/files/v1/assets/${ASSET_ID}/file_sets/`) return reply(201, { id: "fileset-1" });
            if (key === `POST ${API}/files/v1/assets/${ASSET_ID}/files/`)
                return reply(201, { id: "file-1", upload_url: `https://storage.googleapis.com/b/o?sig=${SIGNATURE}` });
            if (key === `POST https://storage.googleapis.com/b/o?sig=${SIGNATURE}`)
                return reply(201, "", { location: `https://storage.googleapis.com/session?sig=${SIGNATURE}` });
            if (key === `PUT https://storage.googleapis.com/session?sig=${SIGNATURE}`) {
                for await (const chunk of config.data as Readable) uploaded.push(String(chunk));
                return options.storageStatus ? reply(options.storageStatus, "<Error><Code>AccessDenied</Code></Error>") : reply(200);
            }
            if (key === `PATCH ${API}/files/v1/assets/${ASSET_ID}/files/file-1/`)
                return options.closeStatus
                    ? reply(options.closeStatus, { errors: ["Token is invalid"] })
                    : reply(200, { id: "file-1", status: "CLOSED", upload_url: `https://signed?sig=${SIGNATURE}` });
            if (key === `POST ${API}/files/v1/assets/${ASSET_ID}/files/file-1/keyframes/`) return reply(200, { job_id: "job-1" });
            if (key === `POST ${API}/assets/v1/delete_queue/assets/`) return reply(201, {});
            throw new Error(`unexpected request ${key}`);
        },
    };
}

describe("UploadFile.execute", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    const calls = () => request.mock.calls.map((c) => c[0] as AxiosRequestConfig);
    const find = (method: string, suffix: string) => calls().find((c) => c.method === method && c.url?.endsWith(suffix));

    it("creates the asset, uploads the file, closes it, starts the proxy job and sets the outputs", async () => {
        const iconik = fakeIconik();
        request.mockImplementation(iconik.handler);
        const { node, outputs } = makeNode({ "Collection ID": COLLECTION_ID });

        await node.execute();

        expect(iconik.uploaded.join("")).toBe("hello iconik");
        const asset = find("POST", "/assets/v1/assets/");
        expect(asset?.data).toEqual({ title: "Interview_Raw_01.mov", type: "ASSET", collection_id: COLLECTION_ID });
        expect(asset?.params).toEqual({ apply_default_acls: true, assign_to_collection: true });
        expect(find("POST", "/formats/")?.data).toEqual({ name: "ORIGINAL", storage_methods: ["GCS"] });
        expect(find("POST", "/file_sets/")?.data).toMatchObject({ format_id: "format-1", storage_id: STORAGE_ID, base_dir: "/" });
        expect(find("POST", `/assets/${ASSET_ID}/files/`)?.data).toMatchObject({
            original_name: "Interview_Raw_01.mov",
            size: 12,
            type: "FILE",
            file_set_id: "fileset-1",
        });
        expect(find("PATCH", "/files/file-1/")?.data).toEqual({ status: "CLOSED", progress_processed: 100 });

        expect(outputs.get("Asset ID")).toBe(ASSET_ID);
        expect(outputs.get("File ID")).toBe("file-1");
        expect(outputs.get("Format ID")).toBe("format-1");
        expect(outputs.get("Transcode job ID")).toBe("job-1");
        expect(outputs.get("File size")).toBe(12);
        expect(outputs.get("File")).toEqual({ id: "file-1", status: "CLOSED" });
        const curl = outputs.get("Curl") as string;
        expect(curl).toContain("/files/v1/storages/matching/FILES/");
        expect(curl).not.toContain(SIGNATURE);
        expect(curl).not.toContain(AUTH_TOKEN);
    });

    it("uses the given title and storage and skips the proxy job when disabled", async () => {
        request.mockImplementation(fakeIconik().handler);
        const { node, outputs } = makeNode({ "Asset Title": "Interview", "Storage ID": STORAGE_ID, "Generate Proxies": false });

        await node.execute();

        expect(find("GET", `/storages/${STORAGE_ID}/`)).toBeDefined();
        expect((find("POST", "/assets/v1/assets/")?.data as { title: string }).title).toBe("Interview");
        expect(find("POST", "/keyframes/")).toBeUndefined();
        expect(outputs.get("Transcode job ID")).toBe("");
    });

    it("fails before creating an asset when the storage method is not supported", async () => {
        request.mockImplementation(fakeIconik({ method: "B2" }).handler);

        await expect(makeNode().node.execute()).rejects.toThrow(/uses method B2, which this node cannot upload to/);
        expect(find("POST", "/assets/v1/assets/")).toBeUndefined();
    });

    it("fails before creating an asset when the storage is not active", async () => {
        request.mockImplementation(fakeIconik({ storageState: "INACTIVE" }).handler);

        await expect(makeNode().node.execute()).rejects.toThrow(/storage "Iconik Storage" is INACTIVE in Iconik/);
        expect(find("POST", "/assets/v1/assets/")).toBeUndefined();
    });

    it("fails clearly when Iconik returns the new asset without an ID", async () => {
        request.mockImplementation(fakeIconik({ assetWithoutId: true }).handler);

        await expect(makeNode().node.execute()).rejects.toThrow(/returned no asset ID/);
        expect(find("POST", "/formats/")).toBeUndefined();
    });

    it("keeps Iconik's authentication message when a later request is rejected, and deletes the asset", async () => {
        request.mockImplementation(fakeIconik({ closeStatus: 401 }).handler);

        await expect(makeNode().node.execute()).rejects.toThrow(
            /^Iconik authentication failed — Iconik returned 401: Token is invalid; the new asset ".*" was moved to the delete queue$/
        );
    });

    it("deletes the new asset again when the storage rejects the upload", async () => {
        request.mockImplementation(fakeIconik({ storageStatus: 403 }).handler);

        const failure = makeNode().node.execute();

        await expect(failure).rejects.toThrow(
            `Could not upload file "Interview_Raw_01.mov" — the storage returned 403: AccessDenied — check the settings of storage "Iconik Storage" in Iconik; the new asset "${ASSET_ID}" was moved to the delete queue`
        );
        expect(find("POST", "/delete_queue/assets/")?.data).toEqual({ ids: [ASSET_ID] });
        expect(find("PATCH", "/files/file-1/")).toBeUndefined();
    });

    it.each([
        [{ "File Path": "" }, /File Path is empty/],
        [{ "File Path": "/no/such/file.mov" }, /does not exist/],
        [{ "Storage ID": "x" }, /Storage ID "x" is not a UUID/],
        [{ "Auth Token": " " }, /^Iconik authentication failed/],
    ])("rejects invalid input %p before calling Iconik", async (override, message) => {
        await expect(makeNode(override).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("names the missing default storage on 404", async () => {
        request.mockResolvedValue(reply(404, { errors: ["No matching storage exists"] }));

        await expect(makeNode().node.execute()).rejects.toThrow(
            "Could not find the storage to upload to: no default file storage is set up in Iconik — Iconik returned 404: No matching storage exists"
        );
    });
});
