import axios, { AxiosRequestConfig } from "axios";
import GetMetadata from "../../lib/nodes/iconikMetadata/GetMetadata";

const OBJECT_ID = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const VIEW_ID = "0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a";
const AUTH_TOKEN = "secret-token-value";

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = {
        "App ID": "app-id-value",
        "Auth Token": AUTH_TOKEN,
        "Object Type": "assets",
        "Object ID": OBJECT_ID,
        "View ID": VIEW_ID,
        ...overrides,
    };
    const node = new GetMetadata();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as GetMetadata["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown) {
    return { status, data, headers: {}, statusText: "", config: {} };
}
describe("GetMetadata.execute", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("reads the view and sets simplified and raw outputs", async () => {
        const response = {
            object_id: OBJECT_ID,
            metadata_values: {
                Description: { field_values: [{ value: "Final cut" }] },
                Keywords: { field_values: [{ value: "A" }, { value: "B" }] },
            },
        };
        request.mockResolvedValue(reply(200, response));
        const { node, outputs } = makeNode();

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.method).toBe("GET");
        expect(config.url).toBe(`https://app.iconik.io/API/metadata/v1/assets/${OBJECT_ID}/views/${VIEW_ID}/`);
        expect(config.params).toEqual({ reencode_values_to_string: false });
        expect(outputs.get("Object ID")).toBe(OBJECT_ID);
        expect(outputs.get("Metadata")).toEqual({ Description: "Final cut", Keywords: ["A", "B"] });
        expect(outputs.get("Field names")).toEqual(["Description", "Keywords"]);
        expect(outputs.get("Metadata values")).toEqual(response);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("reads a collection with values as text", async () => {
        request.mockResolvedValue(reply(200, { metadata_values: {} }));
        const { node, outputs } = makeNode({ "Object Type": "collections", "Values as Text": true });

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.url).toContain("/metadata/v1/collections/");
        expect(config.params).toEqual({ reencode_values_to_string: true });
        expect(outputs.get("Metadata")).toEqual({});
    });

    it.each([
        [{ "Object ID": "x" }, 'Object ID "x" is not a UUID'],
        [{ "View ID": "" }, 'View ID "" is not a UUID'],
        [{ "Object Type": "segments" }, 'Object Type "segments" is not supported'],
    ])("rejects %p before calling Iconik", async (override, message) => {
        await expect(makeNode(override).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("returns empty metadata when nothing is stored yet for an existing view", async () => {
        request
            .mockResolvedValueOnce(reply(404, { errors: ["Metadata values for this object and view doesn't exist"] }))
            .mockResolvedValueOnce(reply(200, { id: VIEW_ID, name: "Default" }));
        const { node, outputs } = makeNode();

        await node.execute();

        expect((request.mock.calls[1][0] as AxiosRequestConfig).url).toBe(`https://app.iconik.io/API/metadata/v1/views/${VIEW_ID}/`);
        expect(outputs.get("Metadata")).toEqual({});
        expect(outputs.get("Field names")).toEqual([]);
        expect(outputs.get("Metadata values")).toEqual({ metadata_values: {} });
    });

    it("names the view when the view does not exist", async () => {
        request
            .mockResolvedValueOnce(reply(404, { errors: ["Metadata values for this object and view doesn't exist"] }))
            .mockResolvedValueOnce(reply(404, { errors: ["Metadata view doesn't exist"] }));
        await expect(makeNode().node.execute()).rejects.toThrow(
            `Could not get metadata: view "${VIEW_ID}" — Iconik returned 404: Metadata view doesn't exist`
        );
    });
});
