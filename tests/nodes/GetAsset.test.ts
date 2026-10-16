import axios, { AxiosRequestConfig } from "axios";
import GetAsset from "../../lib/nodes/iconikAssets/GetAsset";

const ASSET_ID = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const AUTH_TOKEN = "secret-token-value";

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = {
        "App ID": "app-id-value",
        "Auth Token": AUTH_TOKEN,
        "Asset ID": ASSET_ID,
        ...overrides,
    };
    const node = new GetAsset();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as GetAsset["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown, headers: Record<string, string> = {}) {
    return { status, data, headers, statusText: "", config: {} };
}

describe("GetAsset", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("reads the asset and sets the curated and raw outputs", async () => {
        const asset = { id: ASSET_ID, title: "Clip.mov", status: "ACTIVE", type: "ASSET", in_collections: ["c1", "c2"] };
        request.mockResolvedValue(reply(200, asset));
        const { node, outputs } = makeNode({ "Include Collections": true });

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.method).toBe("GET");
        expect(config.url).toBe(`https://app.iconik.io/API/assets/v1/assets/${ASSET_ID}/`);
        expect(config.params).toEqual({ include_collections: true, include_users: false });
        expect(config.headers).toMatchObject({ "App-ID": "app-id-value", "Auth-Token": AUTH_TOKEN });
        expect(outputs.get("Asset ID")).toBe(ASSET_ID);
        expect(outputs.get("Asset title")).toBe("Clip.mov");
        expect(outputs.get("Asset status")).toBe("ACTIVE");
        expect(outputs.get("Asset type")).toBe("ASSET");
        expect(outputs.get("Collection IDs")).toEqual(["c1", "c2"]);
        expect(outputs.get("Asset")).toEqual(asset);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("sends both include flags as false by default and uses a custom Iconik URL", async () => {
        request.mockResolvedValue(reply(200, { id: ASSET_ID }));
        const { node, outputs } = makeNode({ "Iconik URL": "https://eu.iconik.io/", "Include Users": true });

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.url).toBe(`https://eu.iconik.io/API/assets/v1/assets/${ASSET_ID}/`);
        expect(config.params).toEqual({ include_collections: false, include_users: true });
        expect(outputs.get("Collection IDs")).toEqual([]);
        expect(outputs.get("Asset title")).toBe("");
    });

    it("outputs a deleted asset normally", async () => {
        request.mockResolvedValue(reply(200, { id: ASSET_ID, title: "Old.mov", status: "DELETED" }));
        const { node, outputs } = makeNode();

        await node.execute();

        expect(outputs.get("Asset status")).toBe("DELETED");
    });

    it("rejects an invalid Asset ID before calling Iconik", async () => {
        const { node } = makeNode({ "Asset ID": "12345" });

        await expect(node.execute()).rejects.toThrow('Could not get asset — Asset ID "12345" is not a UUID');
        expect(request).not.toHaveBeenCalled();
    });

    it("rejects empty credentials before calling Iconik", async () => {
        const { node } = makeNode({ "App ID": "" });

        await expect(node.execute()).rejects.toThrow(/^Iconik authentication failed/);
        expect(request).not.toHaveBeenCalled();
    });

    it("names the asset ID on 404", async () => {
        request.mockResolvedValue(reply(404, { errors: ["Asset does not exist"] }));
        const { node } = makeNode();

        await expect(node.execute()).rejects.toThrow(
            `Could not get asset: asset "${ASSET_ID}" — Iconik returned 404: Asset does not exist`
        );
    });

    it("passes Iconik's 400 message through and reports 401 as an authentication failure", async () => {
        request.mockResolvedValueOnce(reply(400, { errors: ["Bad request"] }));
        await expect(makeNode().node.execute()).rejects.toThrow("Could not get asset — Iconik returned 400: Bad request");

        request.mockResolvedValueOnce(reply(401, { errors: ["Token is invalid"] }));
        await expect(makeNode().node.execute()).rejects.toThrow("Iconik authentication failed — Iconik returned 401: Token is invalid");
    });

    it("retries a 429 and then succeeds", async () => {
        request.mockResolvedValueOnce(reply(429, {}, { "retry-after": "0" })).mockResolvedValueOnce(reply(200, { id: ASSET_ID }));
        const { node, outputs } = makeNode();

        await node.execute();

        expect(request).toHaveBeenCalledTimes(2);
        expect(outputs.get("Asset ID")).toBe(ASSET_ID);
    });
});
