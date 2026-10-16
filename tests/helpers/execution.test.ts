import axios, { AxiosRequestConfig } from "axios";
import Wave from "wave-engine/helpers/Wave";
import { callIconik, connectionFromInputs, retryOptions, runListRequest, setCurlOutput } from "../../lib/helpers/execution";
import { DEFAULT_ICONIK_URL } from "../../lib/helpers/http";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../lib/helpers/specification";

function makeWave(inputs: Record<string, unknown>, canceled = false) {
    const outputs = new Map<string, unknown>();
    const wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config.headers) },
        general: { isCanceled: () => canceled },
    } as unknown as Wave;
    return { wave, outputs };
}

describe("execution helpers", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("reads the connection by the node's input names", () => {
        const { wave } = makeWave({ Id: " a ", Token: "t", Url: "" });
        expect(connectionFromInputs(wave, "Id", "Token", "Url")).toEqual({ appId: "a", authToken: "t", baseUrl: DEFAULT_ICONIK_URL });
        expect(retryOptions(makeWave({}, true).wave).isCanceled?.()).toBe(true);
    });

    it("writes one redacted curl per request", () => {
        const { wave, outputs } = makeWave({});
        const config = { headers: { "App-ID": "a", "Auth-Token": "secret" } };
        setCurlOutput(wave, "Curl", [config, config]);
        const curl = outputs.get("Curl") as string;
        expect(curl.split("\n\n")).toHaveLength(2);
        expect(curl).not.toContain("secret");
    });

    it("sets Curl and uses the 404 override when asked", async () => {
        const { wave, outputs } = makeWave({});
        const connection = { appId: "a", authToken: "secret-token", baseUrl: "https://x.io" };
        request.mockResolvedValueOnce({ status: 404, data: { errors: ["nope"] }, headers: {} });
        await expect(
            callIconik(
                wave,
                connection,
                { url: "x", headers: {} },
                { action: "x" },
                { curlOutput: "Curl", onNotFound: () => new Error("custom") }
            )
        ).rejects.toThrow("custom");
        expect(outputs.has("Curl")).toBe(true);
    });

    it("sends a request and maps failures with the token removed", async () => {
        const { wave } = makeWave({});
        const connection = { appId: "a", authToken: "secret-token", baseUrl: "https://x.io" };
        request.mockResolvedValueOnce({ status: 200, data: { ok: true }, headers: {} });
        await expect(callIconik(wave, connection, { url: "x" }, { action: "get asset" })).resolves.toEqual({ ok: true });

        request.mockResolvedValueOnce({ status: 404, data: { errors: ["secret-token not found"] }, headers: {} });
        await expect(callIconik(wave, connection, { url: "x" }, { action: "get asset", target: 'asset "1"' })).rejects.toThrow(
            'Could not get asset: asset "1" — Iconik returned 404: <your-auth-token> not found'
        );
    });
});

describe("specification helpers", () => {
    it("builds the shared inputs and outputs", () => {
        expect(credentialInputs("App ID", "Auth Token").map((i) => [i.name, i.type, "mandatory" in i && i.mandatory])).toEqual([
            ["App ID", "STRING_PASSWORD", true],
            ["Auth Token", "STRING_PASSWORD", true],
        ]);
        expect(iconikUrlInput("Iconik URL")).toMatchObject({ defaultValue: DEFAULT_ICONIK_URL, advanced: true, mandatory: false });
        expect(curlOutput("Curl", "d", "e")).toEqual({ name: "Curl", description: "d", type: "STRING", example: "e" });
        expect(author().company).toBe("MoovIT GmbH");
        expect(initialVersion()).toMatchObject({ major: 1, minor: 0, patch: 0 });
        // Every call returns a new object, so changing one node's version or changelog leaves the others alone.
        const one = initialVersion();
        one.changelog.push("changed");
        expect(initialVersion().changelog).toEqual(["Initial release"]);
        expect(author()).not.toBe(author());
    });
});

describe("runListRequest", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    const names = {
        objectIds: "ids",
        totalCount: "total",
        page: "page",
        pages: "pages",
        warning: "warning",
        objects: "objects",
        raw: "raw",
    };
    const context = { action: "search Iconik", target: (p: number) => `page ${p}`, warningNoun: "matches", warningHint: "Narrow it." };
    const connection = { appId: "example-app-id", authToken: "secret-token", baseUrl: "https://x.io" };

    it("sets every list output", async () => {
        const { wave, outputs } = makeWave({});
        request.mockResolvedValue({ status: 200, headers: {}, data: { objects: [{ id: "a" }, { id: "b" }], page: 1, pages: 1, total: 2 } });
        await runListRequest(wave, connection, { url: "x" }, { page: 1, perPage: 50, fetchAll: false }, context, names);
        expect(Object.fromEntries(outputs)).toMatchObject({ ids: ["a", "b"], total: 2, page: 1, pages: 1, warning: "" });
    });

    it("names the page that failed during Fetch All", async () => {
        const { wave } = makeWave({});
        request
            .mockResolvedValueOnce({ status: 200, headers: {}, data: { objects: [{ id: "a" }], page: 1, pages: 3, total: 3 } })
            .mockResolvedValueOnce({ status: 404, headers: {}, data: { errors: ["Requested page does not exist"] } });
        await expect(
            runListRequest(wave, connection, { url: "x" }, { page: 1, perPage: 1, fetchAll: true }, context, names)
        ).rejects.toThrow("Could not search Iconik: page 2 — Iconik returned 404");
    });
});
