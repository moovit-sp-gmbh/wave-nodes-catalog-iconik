import axios, { AxiosRequestConfig } from "axios";
import GetOriginalDownloadUrl from "../../lib/nodes/iconikFiles/GetOriginalDownloadUrl";
import { IconikFile, IconikFormat } from "../../lib/helpers/files";

const AUTH_TOKEN = "secret-token-value";
const ASSET = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const FORMAT = "8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d";
const PROXY_FORMAT = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = { "App ID": "app-id-value", "Auth Token": AUTH_TOKEN, "Asset ID": ASSET, ...overrides };
    const node = new GetOriginalDownloadUrl();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as GetOriginalDownloadUrl["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown) {
    return { status, data, headers: {}, statusText: "", config: {} };
}

const file = (n: number, extra: Partial<IconikFile> = {}): IconikFile => ({
    id: uuid(n),
    name: `file_${n}.mov`,
    size: 1000 * n,
    status: "CLOSED",
    format_id: FORMAT,
    ...extra,
});

/** Fake Iconik files service with a cursor-paged files list. */
function fakeIconik(
    format: IconikFormat | null,
    files: IconikFile[],
    url = "https://storage.example.com/signed?sig=abc",
    options: { assetExists?: boolean; pageLimit?: number } = {}
) {
    return (config: AxiosRequestConfig) => {
        const path = config.url ?? "";
        if (path.endsWith(`/assets/v1/assets/${ASSET}/`)) {
            return Promise.resolve(
                options.assetExists === false ? reply(404, { errors: ["Asset does not exist"] }) : reply(200, { id: ASSET })
            );
        }
        if (path.endsWith("/formats/ORIGINAL/")) {
            return Promise.resolve(format ? reply(200, format) : reply(404, { errors: ["Format for this asset doesn't exist"] }));
        }
        if (path.endsWith("/files/")) {
            const { last_id } = config.params as { per_page: number; last_id?: string };
            const per_page = Math.min((config.params as { per_page: number }).per_page, options.pageLimit ?? Infinity);
            const start = last_id ? files.findIndex((f) => f.id === last_id) + 1 : 0;
            const objects = files.slice(start, start + per_page);
            const more = start + per_page < files.length;
            return Promise.resolve(reply(200, { objects, per_page, next_url: more ? "next" : null }));
        }
        if (path.endsWith("/download_url/")) return Promise.resolve(reply(200, { url }));
        return Promise.resolve(reply(404, { errors: ["Not found"] }));
    };
}
describe("GetOriginalDownloadUrl.execute", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("runs the three calls and sets the outputs", async () => {
        request.mockImplementation(fakeIconik({ id: FORMAT, name: "ORIGINAL" }, [file(1, { format_id: PROXY_FORMAT }), file(2), file(3)]));
        const { node, outputs } = makeNode();

        await node.execute();

        const urls = request.mock.calls.map((c) => (c[0] as AxiosRequestConfig).url);
        expect(urls).toEqual([
            `https://app.iconik.io/API/files/v1/assets/${ASSET}/formats/ORIGINAL/`,
            `https://app.iconik.io/API/files/v1/assets/${ASSET}/files/`,
            `https://app.iconik.io/API/files/v1/assets/${ASSET}/files/${uuid(2)}/download_url/`,
        ]);
        expect(outputs.get("Download URL")).toBe("https://storage.example.com/signed?sig=abc");
        expect(outputs.get("File ID")).toBe(uuid(2));
        expect(outputs.get("File name")).toBe("file_2.mov");
        expect(outputs.get("File size")).toBe(2000);
        expect(outputs.get("Format ID")).toBe(FORMAT);
        expect((outputs.get("Files") as IconikFile[]).map((f) => f.id)).toEqual([uuid(2), uuid(3)]);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("follows the files cursor across pages", async () => {
        const files = Array.from({ length: 230 }, (_, i) => file(i + 1, { format_id: i === 229 ? FORMAT : PROXY_FORMAT }));
        request.mockImplementation(fakeIconik({ id: FORMAT }, files));
        const { node, outputs } = makeNode();

        await node.execute();

        const listCalls = request.mock.calls.map((c) => c[0] as AxiosRequestConfig).filter((c) => c.url?.endsWith("/files/"));
        expect(listCalls.map((c) => (c.params as { last_id?: string }).last_id)).toEqual([undefined, uuid(100), uuid(200)]);
        expect(outputs.get("File ID")).toBe(uuid(230));
    });

    it("fails with the defined message for an asset without an original format", async () => {
        request.mockImplementation(fakeIconik(null, []));
        await expect(makeNode().node.execute()).rejects.toThrow(/^Asset has no original file/);
        expect(request).toHaveBeenCalledTimes(2);
    });

    it("says the asset does not exist instead of 'no original file' for an unknown asset", async () => {
        request.mockImplementation(fakeIconik(null, [], undefined, { assetExists: false }));
        await expect(makeNode().node.execute()).rejects.toThrow(`Iconik has no asset "${ASSET}" (404)`);
    });

    it("keeps following next_url when Iconik returns smaller pages than requested", async () => {
        const files = Array.from({ length: 80 }, (_, i) => file(i + 1, { format_id: i === 79 ? FORMAT : PROXY_FORMAT }));
        request.mockImplementation(fakeIconik({ id: FORMAT }, files, undefined, { pageLimit: 30 }));
        const { node, outputs } = makeNode();

        await node.execute();

        expect(outputs.get("File ID")).toBe(uuid(80));
    });

    it("fails instead of returning part of a file listing that never ends", async () => {
        let nextId = 1;
        request.mockImplementation((config: AxiosRequestConfig) =>
            Promise.resolve(
                config.url?.endsWith("/files/")
                    ? reply(200, { objects: [file(nextId++, { format_id: PROXY_FORMAT })], next_url: "next" })
                    : reply(200, { id: FORMAT })
            )
        );
        await expect(makeNode().node.execute()).rejects.toThrow(/has more than 10000 files/);
    });

    it("fails clearly when the original file has no ID", async () => {
        request.mockImplementation(fakeIconik({ id: FORMAT }, [file(1, { id: undefined })]));
        await expect(makeNode().node.execute()).rejects.toThrow(/without an ID/);
        expect(request.mock.calls.some((c) => (c[0] as AxiosRequestConfig).url?.endsWith("/download_url/"))).toBe(false);
    });

    it("fails with the defined message when the original format has no files", async () => {
        request.mockImplementation(fakeIconik({ id: FORMAT }, [file(1, { format_id: PROXY_FORMAT })]));
        await expect(makeNode().node.execute()).rejects.toThrow(/^Asset has no original file/);
    });

    it("fails for an archived original before asking for a URL", async () => {
        request.mockImplementation(fakeIconik({ id: FORMAT, archive_status: "ARCHIVED" }, [file(1)]));
        await expect(makeNode().node.execute()).rejects.toThrow(/is archived/);
        expect(request.mock.calls.some((c) => (c[0] as AxiosRequestConfig).url?.endsWith("/download_url/"))).toBe(false);
    });

    it("fails when Iconik returns no URL", async () => {
        request.mockImplementation(fakeIconik({ id: FORMAT }, [file(1)], ""));
        await expect(makeNode().node.execute()).rejects.toThrow(/Iconik returned no URL/);
    });

    it("rejects an invalid Asset ID and reports authentication failures", async () => {
        await expect(makeNode({ "Asset ID": "abc" }).node.execute()).rejects.toThrow('Asset ID "abc" is not a UUID');
        expect(request).not.toHaveBeenCalled();

        request.mockResolvedValue(reply(401, { errors: ["Token is invalid"] }));
        await expect(makeNode().node.execute()).rejects.toThrow("Iconik authentication failed — Iconik returned 401: Token is invalid");
    });
});
