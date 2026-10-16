import axios, { AxiosRequestConfig } from "axios";
import Search from "../../lib/nodes/iconikSearch/Search";

const AUTH_TOKEN = "secret-token-value";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = { "App ID": "app-id-value", "Auth Token": AUTH_TOKEN, "Search Query": "summer", ...overrides };
    const node = new Search();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as Search["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown) {
    return { status, data, headers: {}, statusText: "", config: {} };
}

/** Fake search over `total` objects that honours page and per_page. */
function pagedSearch(total: number) {
    return (config: AxiosRequestConfig) => {
        const { page, per_page } = config.params as { page: number; per_page: number };
        const start = (page - 1) * per_page;
        const objects = Array.from({ length: Math.max(0, Math.min(per_page, total - start)) }, (_, i) => ({ id: uuid(start + i + 1) }));
        return Promise.resolve(reply(200, { objects, page, per_page, pages: Math.ceil(total / per_page), total }));
    };
}

describe("Search.execute", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("fetches one page and sets the outputs", async () => {
        request.mockImplementation(pagedSearch(120));
        const { node, outputs } = makeNode({ "Results per Page": 50, Page: 2 });

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.method).toBe("POST");
        expect(config.url).toBe("https://app.iconik.io/API/search/v1/search/");
        expect(config.params).toEqual({ page: 2, per_page: 50, generate_signed_url: true });
        expect(config.data).toEqual({ doc_types: ["assets"], query: "summer" });
        expect((outputs.get("Object IDs") as string[]).length).toBe(50);
        expect((outputs.get("Object IDs") as string[])[0]).toBe(uuid(51));
        expect(outputs.get("Total count")).toBe(120);
        expect(outputs.get("Page")).toBe(2);
        expect(outputs.get("Pages")).toBe(3);
        expect(outputs.get("Warning")).toBe("");
        expect((outputs.get("Search result") as { page: number }).page).toBe(2);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("fetches all pages when Fetch All is enabled", async () => {
        request.mockImplementation(pagedSearch(120));
        const { node, outputs } = makeNode({ "Results per Page": 50, Page: 3, "Fetch All": true });

        await node.execute();

        expect(request.mock.calls.map((c) => (c[0] as AxiosRequestConfig).params.page)).toEqual([1, 2, 3]);
        expect((outputs.get("Objects") as unknown[]).length).toBe(120);
        expect(outputs.get("Page")).toBe(3);
        expect(outputs.get("Warning")).toBe("");
    });

    it("stops at 10,000 objects and sets a warning", async () => {
        request.mockImplementation(pagedSearch(12_500));
        const { node, outputs } = makeNode({ "Results per Page": 500, "Fetch All": true });

        await node.execute();

        expect(request).toHaveBeenCalledTimes(20);
        expect((outputs.get("Object IDs") as string[]).length).toBe(10_000);
        expect(outputs.get("Total count")).toBe(12_500);
        expect(outputs.get("Warning")).toBe(
            "Fetch All stopped at 10000 objects; Iconik reports 12500 matches. Narrow the search to get the rest."
        );
    });

    it.each([
        [{ "Results per Page": 0 }, /Results per Page "0" is out of range/],
        [{ Page: -1 }, /Page "-1" is out of range/],
        [{ "Object Types": "constructor" }, /Object Types "constructor" is not supported/],
    ])("rejects %p before calling Iconik", async (override, message) => {
        await expect(makeNode(override).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("passes Iconik's 400 message through and names the page on 404", async () => {
        request.mockResolvedValueOnce(reply(400, { errors: { filter: "Unknown operator." } }));
        await expect(makeNode().node.execute()).rejects.toThrow("Could not search Iconik — Iconik returned 400: filter: Unknown operator.");

        request.mockResolvedValueOnce(reply(404, { errors: ["Requested page does not exist"] }));
        await expect(makeNode({ Page: 9 }).node.execute()).rejects.toThrow(
            "Could not search Iconik: page 9 — Iconik returned 404: Requested page does not exist"
        );
    });
});
