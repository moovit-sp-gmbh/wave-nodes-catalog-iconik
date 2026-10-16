import axios, { AxiosRequestConfig } from "axios";
import UpdateAsset from "../../lib/nodes/iconikAssets/UpdateAsset";

const ASSET_ID = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const AUTH_TOKEN = "secret-token-value";

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = {
        "App ID": "app-id-value",
        "Auth Token": AUTH_TOKEN,
        "Asset ID": ASSET_ID,
        "Asset Title": "Interview Final 01",
        ...overrides,
    };
    const node = new UpdateAsset();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as UpdateAsset["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown) {
    return { status, data, headers: {}, statusText: "", config: {} };
}

describe("UpdateAsset.execute", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("patches only the filled-in fields and sets the outputs", async () => {
        const updated = { id: ASSET_ID, title: "Interview Final 01", warning: "Rights", status: "ACTIVE" };
        request.mockResolvedValue(reply(200, updated));
        const { node, outputs } = makeNode({ "Asset Warning": "Rights" });

        await node.execute();

        expect(request).toHaveBeenCalledTimes(1);
        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.method).toBe("PATCH");
        expect(config.url).toBe(`https://app.iconik.io/API/assets/v1/assets/${ASSET_ID}/`);
        expect(config.data).toEqual({ title: "Interview Final 01", warning: "Rights" });
        expect(config.params).toBeUndefined();
        expect(outputs.get("Asset ID")).toBe(ASSET_ID);
        expect(outputs.get("Updated fields")).toEqual(["title", "warning"]);
        expect(outputs.get("Asset")).toEqual(updated);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("sends the current title back unchanged when Asset Title is empty", async () => {
        request
            .mockResolvedValueOnce(reply(200, { id: ASSET_ID, title: "Current Title" }))
            .mockResolvedValueOnce(reply(200, { id: ASSET_ID, title: "Current Title", warning: "Rights" }));
        const { node, outputs } = makeNode({ "Asset Title": "", "Asset Warning": "Rights" });

        await node.execute();

        const calls = request.mock.calls.map((c) => c[0] as AxiosRequestConfig);
        expect(calls.map((c) => c.method)).toEqual(["GET", "PATCH"]);
        expect(calls[1].data).toEqual({ title: "Current Title", warning: "Rights" });
        expect(outputs.get("Updated fields")).toEqual(["warning"]);
    });

    it.each([
        [{ "Asset ID": "abc" }, 'Asset ID "abc" is not a UUID'],
        [{ "Asset Title": "" }, "no field to change is filled in"],
        [{ "App ID": undefined }, "Iconik authentication failed"],
    ])("rejects invalid input %p before calling Iconik", async (override, message) => {
        await expect(makeNode(override).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("names the asset on 404 and passes Iconik's 400 message through", async () => {
        request.mockResolvedValueOnce(reply(404, { errors: ["Asset does not exist"] }));
        await expect(makeNode().node.execute()).rejects.toThrow(
            `Could not update asset: asset "${ASSET_ID}" — Iconik returned 404: Asset does not exist`
        );

        request.mockResolvedValueOnce(reply(400, { errors: { external_link: "Not a valid URL." } }));
        await expect(makeNode().node.execute()).rejects.toThrow(
            "Could not update asset — Iconik returned 400: external_link: Not a valid URL."
        );
    });
});
