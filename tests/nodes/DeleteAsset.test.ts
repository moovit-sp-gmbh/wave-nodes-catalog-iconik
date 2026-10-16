import axios, { AxiosRequestConfig } from "axios";
import DeleteAsset from "../../lib/nodes/iconikAssets/DeleteAsset";

const AUTH_TOKEN = "secret-token-value";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeNode(assetIds: unknown, overrides: Record<string, unknown> = {}, canceled = () => false) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = { "App ID": "app-id-value", "Auth Token": AUTH_TOKEN, "Asset IDs": assetIds, ...overrides };
    const node = new DeleteAsset();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: canceled },
        logger: { updateProgress: () => undefined },
    } as unknown as DeleteAsset["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown = "") {
    return { status, data, headers: {}, statusText: "", config: {} };
}

describe("DeleteAsset", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("moves the assets to the delete queue and sets the outputs", async () => {
        request.mockResolvedValue(reply(204));
        const { node, outputs } = makeNode([uuid(1), uuid(2)]);

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.method).toBe("POST");
        expect(config.url).toBe("https://app.iconik.io/API/assets/v1/delete_queue/assets/");
        expect(config.data).toEqual({ ids: [uuid(1), uuid(2)] });
        expect(outputs.get("Deleted IDs")).toEqual([uuid(1), uuid(2)]);
        expect(outputs.get("Deleted count")).toBe(2);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("accepts a single string, a JSON list entry and separated IDs, and drops duplicates", async () => {
        request.mockResolvedValue(reply(204));
        const single = makeNode(` ${uuid(1)} `);
        await single.node.execute();
        expect(single.outputs.get("Deleted IDs")).toEqual([uuid(1)]);

        const mixed = makeNode([JSON.stringify([uuid(1), uuid(2)]), `${uuid(3)}, ${uuid(1)}\n${uuid(4)}`]);
        await mixed.node.execute();
        expect(mixed.outputs.get("Deleted IDs")).toEqual([uuid(1), uuid(2), uuid(3), uuid(4)]);
    });

    it("splits more than 100 IDs into calls of at most 100", async () => {
        request.mockResolvedValue(reply(204));
        const ids = Array.from({ length: 250 }, (_, i) => uuid(i + 1));
        const { node, outputs } = makeNode(ids);

        await node.execute();

        const sent = request.mock.calls.map((c) => (c[0] as AxiosRequestConfig).data as { ids: string[] });
        expect(sent.map((b) => b.ids.length)).toEqual([100, 100, 50]);
        expect(sent.flatMap((b) => b.ids)).toEqual(ids);
        expect(outputs.get("Deleted count")).toBe(250);
        expect((outputs.get("Curl") as string).split("\n\n")).toHaveLength(3);
    });

    it.each([
        [[], /Asset IDs is empty/],
        [["", "  "], /Asset IDs is empty/],
        [undefined, /Asset IDs is empty/],
        [[uuid(1), "abc"], /Asset IDs "abc" is not a UUID/],
        [["[not json"], /is not a valid list/],
    ])("rejects %p before calling Iconik", async (ids, message) => {
        await expect(makeNode(ids).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("reports how many assets were already moved when a later batch fails", async () => {
        request.mockResolvedValueOnce(reply(204)).mockResolvedValueOnce(reply(400, { errors: ["Invalid ids"] }));
        const ids = Array.from({ length: 150 }, (_, i) => uuid(i + 1));

        await expect(makeNode(ids).node.execute()).rejects.toThrow(
            "Could not delete assets — Iconik returned 400: Invalid ids — 100 of 150 assets were already moved to the delete queue before this error"
        );
    });

    it("stops between batches when the stream is canceled", async () => {
        request.mockResolvedValue(reply(204));
        const ids = Array.from({ length: 150 }, (_, i) => uuid(i + 1));

        await expect(makeNode(ids, {}, () => true).node.execute()).rejects.toThrow(
            "the stream was canceled — 100 of 150 assets were already moved to the delete queue"
        );
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("reports 403 as an authentication failure", async () => {
        request.mockResolvedValue(reply(403, { errors: ["Permission denied"] }));
        await expect(makeNode([uuid(1)]).node.execute()).rejects.toThrow(
            "Iconik authentication failed — Iconik returned 403: Permission denied"
        );
    });
});
