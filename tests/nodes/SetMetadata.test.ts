import axios, { AxiosRequestConfig } from "axios";
import SetMetadata from "../../lib/nodes/iconikMetadata/SetMetadata";

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
        Metadata: '{"Description": "Final cut", "Keywords": ["Summer", "Beach"]}',
        ...overrides,
    };
    const node = new SetMetadata();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as SetMetadata["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown, headers: Record<string, string> = {}) {
    return { status, data, headers, statusText: "", config: {} };
}
describe("SetMetadata.execute", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("sends the Iconik request and sets the outputs", async () => {
        const iconikResponse = { metadata_values: { Description: { field_values: [{ value: "Final cut" }] } } };
        request.mockResolvedValue(reply(200, iconikResponse));
        const { node, outputs } = makeNode();

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.method).toBe("PUT");
        expect(config.url).toBe(`https://app.iconik.io/API/metadata/v1/assets/${OBJECT_ID}/views/${VIEW_ID}/`);
        expect(config.params).toEqual({ ignore_unchanged: true });
        expect(config.headers).toMatchObject({ "App-ID": "app-id-value", "Auth-Token": AUTH_TOKEN });
        expect(config.data).toEqual({
            metadata_values: {
                Description: { mode: "overwrite", field_values: [{ value: "Final cut" }] },
                Keywords: { mode: "overwrite", field_values: [{ value: "Summer" }, { value: "Beach" }] },
            },
        });
        expect(outputs.get("Object ID")).toBe(OBJECT_ID);
        expect(outputs.get("Metadata")).toEqual(iconikResponse);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
        expect(outputs.get("Curl")).toContain("<your-auth-token>");
    });

    it("uses a custom Iconik URL, collections, append mode and ignore_unchanged=false", async () => {
        request.mockResolvedValue(reply(200, {}));
        const { node } = makeNode({
            "Iconik URL": "https://eu.iconik.io/",
            "Object Type": "collections",
            Mode: "append",
            "Ignore Unchanged": false,
        });

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.url).toBe(`https://eu.iconik.io/API/metadata/v1/collections/${OBJECT_ID}/views/${VIEW_ID}/`);
        expect(config.params).toEqual({ ignore_unchanged: false });
        expect((config.data as { metadata_values: Record<string, { mode: string }> }).metadata_values.Keywords.mode).toBe("append");
    });

    it.each([
        [{ "Object ID": "not-a-uuid" }, /Object ID "not-a-uuid" is not a UUID/],
        [{ "View ID": "123" }, /View ID "123" is not a UUID/],
        [{ Metadata: "{}" }, /contains no fields/],
        [{ "Auth Token": "" }, /Iconik authentication failed/],
    ])("rejects invalid input %p before calling Iconik", async (override, message) => {
        const { node } = makeNode(override);

        await expect(node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("passes Iconik's 400 message through unchanged", async () => {
        request.mockResolvedValue(reply(400, { errors: ["Field 'Descriptoin' is not in view"] }));
        const { node } = makeNode();

        await expect(node.execute()).rejects.toThrow("Could not set metadata — Iconik returned 400: Field 'Descriptoin' is not in view");
    });

    it.each([401, 403])("reports %p as an authentication failure with Iconik's message", async (status) => {
        request.mockResolvedValue(reply(status, { errors: ["Token is invalid"] }));
        const { node } = makeNode();

        await expect(node.execute()).rejects.toThrow(`Iconik authentication failed — Iconik returned ${status}: Token is invalid`);
    });

    it("never lets the token through, even if Iconik echoes it", async () => {
        request.mockResolvedValue(reply(401, { errors: [`Token ${AUTH_TOKEN} is invalid`] }));
        const { node } = makeNode();

        const error = await node.execute().catch((e: Error) => e);
        expect((error as Error).message).not.toContain(AUTH_TOKEN);
        expect((error as Error).message).toContain("Token <your-auth-token> is invalid");
    });

    it("passes per-field errors through", async () => {
        request.mockResolvedValue(reply(400, { errors: { Rating: "Not a valid integer." } }));
        const { node } = makeNode();

        await expect(node.execute()).rejects.toThrow("Iconik returned 400: Rating: Not a valid integer.");
    });

    it("names object type, object ID and view ID on 404", async () => {
        request.mockResolvedValue(reply(404, { errors: ["Metadata view doesn't exist"] }));
        const { node } = makeNode();

        await expect(node.execute()).rejects.toThrow(
            `Could not set metadata: assets "${OBJECT_ID}", view "${VIEW_ID}" — Iconik returned 404: Metadata view doesn't exist`
        );
    });

    it("retries a 429 and then succeeds", async () => {
        request.mockResolvedValueOnce(reply(429, {}, { "retry-after": "0" })).mockResolvedValueOnce(reply(200, { ok: true }));
        const { node, outputs } = makeNode();

        await node.execute();

        expect(request).toHaveBeenCalledTimes(2);
        expect(outputs.get("Metadata")).toEqual({ ok: true });
    });

    it("fails after 3 rate-limited attempts", async () => {
        request.mockResolvedValue(reply(429, { errors: ["Too many requests"] }, { "retry-after": "0" }));
        const { node } = makeNode();

        await expect(node.execute()).rejects.toThrow("Could not set metadata after 3 attempts — Iconik returned 429: Too many requests");
        expect(request).toHaveBeenCalledTimes(3);
    });

    it("wraps network errors in a three-part message", async () => {
        request.mockRejectedValue(new Error("getaddrinfo ENOTFOUND app.iconik.io"));
        const { node } = makeNode();

        await expect(node.execute()).rejects.toThrow(/request to Iconik failed: getaddrinfo ENOTFOUND .* check the Iconik URL/);
    });
});
