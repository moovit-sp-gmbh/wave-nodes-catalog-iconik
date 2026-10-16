import axios, { AxiosRequestConfig } from "axios";
import ListCollectionContents from "../../lib/nodes/iconikCollections/ListCollectionContents";

const AUTH_TOKEN = "secret-token-value";
const COLLECTION = "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = {
        "App ID": "app-id-value",
        "Auth Token": AUTH_TOKEN,
        "Collection ID": COLLECTION,
        ...overrides,
    };
    const node = new ListCollectionContents();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as ListCollectionContents["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown) {
    return { status, data, headers: {}, statusText: "", config: {} };
}

/** Fake contents listing over `total` objects that honours page and per_page. */
function pagedContents(total: number) {
    return (config: AxiosRequestConfig) => {
        const { page, per_page } = config.params as { page: number; per_page: number };
        const start = (page - 1) * per_page;
        const objects = Array.from({ length: Math.max(0, Math.min(per_page, total - start)) }, (_, i) => ({ id: uuid(start + i + 1) }));
        return Promise.resolve(reply(200, { objects, page, per_page, pages: Math.ceil(total / per_page), total }));
    };
}

describe("ListCollectionContents", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("lists one page of assets and collections by default", async () => {
        request.mockImplementation(pagedContents(70));
        const { node, outputs } = makeNode();

        await node.execute();

        const config = request.mock.calls[0][0] as AxiosRequestConfig;
        expect(config.method).toBe("GET");
        expect(config.url).toBe(`https://app.iconik.io/API/assets/v1/collections/${COLLECTION}/contents/`);
        expect(config.params).toEqual({ object_types: "assets,collections", page: 1, per_page: 50 });
        expect((outputs.get("Object IDs") as string[]).length).toBe(50);
        expect(outputs.get("Total count")).toBe(70);
        expect(outputs.get("Page")).toBe(1);
        expect(outputs.get("Pages")).toBe(2);
        expect(outputs.get("Warning")).toBe("");
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("passes object type, page, page size and sort", async () => {
        request.mockImplementation(pagedContents(70));
        const { node, outputs } = makeNode({
            "Object Types": "assets",
            Page: 2,
            "Results per Page": 20,
            "Sort Order": "date_created,desc",
        });

        await node.execute();

        expect((request.mock.calls[0][0] as AxiosRequestConfig).params).toEqual({
            object_types: "assets",
            page: 2,
            per_page: 20,
            sort: "date_created,desc",
        });
        expect((outputs.get("Object IDs") as string[])[0]).toBe(uuid(21));
    });

    it("fetches all pages and respects the 10,000 cap", async () => {
        request.mockImplementation(pagedContents(120));
        const all = makeNode({ "Fetch All": true, "Results per Page": 50, Page: 5 });
        await all.node.execute();
        expect(request.mock.calls.map((c) => (c[0] as AxiosRequestConfig).params.page)).toEqual([1, 2, 3]);
        expect((all.outputs.get("Objects") as unknown[]).length).toBe(120);

        request.mockReset().mockImplementation(pagedContents(10_400));
        const capped = makeNode({ "Fetch All": true, "Results per Page": 500 });
        await capped.node.execute();
        expect(request).toHaveBeenCalledTimes(20);
        expect((capped.outputs.get("Object IDs") as string[]).length).toBe(10_000);
        expect(capped.outputs.get("Warning")).toBe(
            "Fetch All stopped at 10000 objects; Iconik reports 10400 objects. Use Page to get the rest."
        );
    });

    it.each([
        [{ "Collection ID": "abc" }, 'Collection ID "abc" is not a UUID'],
        [{ "Object Types": "segments" }, 'Object Types "segments" is not supported'],
        [{ "Results per Page": 1000 }, 'Results per Page "1000" is out of range'],
        [{ Page: 0 }, 'Page "0" is out of range'],
    ])("rejects %p before calling Iconik", async (override, message) => {
        await expect(makeNode(override).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("names the collection on 404", async () => {
        request.mockResolvedValue(reply(404, { errors: ["Collection does not exist"] }));
        await expect(makeNode().node.execute()).rejects.toThrow(
            `Could not list collection contents: collection "${COLLECTION}" — Iconik returned 404: Collection does not exist`
        );
    });
});
