import axios, { AxiosRequestConfig } from "axios";
import AddToCollection from "../../lib/nodes/iconikCollections/AddToCollection";

const AUTH_TOKEN = "secret-token-value";
const COLLECTION = "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeNode(objectIds: unknown, overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = {
        "App ID": "app-id-value",
        "Auth Token": AUTH_TOKEN,
        "Collection ID": COLLECTION,
        "Object IDs": objectIds,
        ...overrides,
    };
    const node = new AddToCollection();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
        logger: { updateProgress: () => undefined },
    } as unknown as AddToCollection["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown = "") {
    return { status, data, headers: {}, statusText: "", config: {} };
}

/**
 * Fake Iconik: `present` objects are already in the collection and answer 400 on add;
 * `missing` objects do not exist and answer 400 too, but are not found by the membership check.
 */
function fakeIconik(present: string[], missing: string[], status = 400) {
    return (config: AxiosRequestConfig) => {
        if (config.method === "GET") {
            const id = (config.params as { object_ids: string }).object_ids;
            return Promise.resolve(reply(200, { objects: present.includes(id) ? [{ id }] : [], page: 1, pages: 1, total: 0 }));
        }
        const id = (config.data as { object_id: string }).object_id;
        if (present.includes(id)) return Promise.resolve(reply(status, { errors: ["Object already in collection"] }));
        if (missing.includes(id)) return Promise.resolve(reply(400, { errors: ["Object does not exist"] }));
        return Promise.resolve(reply(201));
    };
}

describe("AddToCollection", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("adds each object with its own call and sets the outputs", async () => {
        request.mockImplementation(fakeIconik([], []));
        const { node, outputs } = makeNode([uuid(1), uuid(2)]);

        await node.execute();

        const calls = request.mock.calls.map((c) => c[0] as AxiosRequestConfig);
        expect(calls).toHaveLength(2);
        expect(calls[0]).toMatchObject({ method: "POST", url: `https://app.iconik.io/API/assets/v1/collections/${COLLECTION}/contents/` });
        expect(calls.map((c) => c.data)).toEqual([
            { object_id: uuid(1), object_type: "assets" },
            { object_id: uuid(2), object_type: "assets" },
        ]);
        expect(outputs.get("Added IDs")).toEqual([uuid(1), uuid(2)]);
        expect(outputs.get("Added count")).toBe(2);
        expect(outputs.get("Failed")).toEqual([]);
        expect(outputs.get("Failed count")).toBe(0);
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("accepts a single string and collections as object type", async () => {
        request.mockImplementation(fakeIconik([], []));
        const { node, outputs } = makeNode(uuid(3), { "Object Type": "collections" });

        await node.execute();

        expect((request.mock.calls[0][0] as AxiosRequestConfig).data).toEqual({ object_id: uuid(3), object_type: "collections" });
        expect(outputs.get("Added IDs")).toEqual([uuid(3)]);
    });

    it.each([400, 409])("treats an object already in the collection (%p) as added", async (status) => {
        request.mockImplementation(fakeIconik([uuid(1)], [], status));
        const { node, outputs } = makeNode([uuid(1), uuid(2)]);

        await node.execute();

        const lookup = request.mock.calls.map((c) => c[0] as AxiosRequestConfig).find((c) => c.method === "GET");
        expect(lookup?.params).toMatchObject({ object_ids: uuid(1), object_types: "assets" });
        expect(outputs.get("Added IDs")).toEqual([uuid(1), uuid(2)]);
        expect(outputs.get("Failed count")).toBe(0);
    });

    it("continues past a failed object and reports it", async () => {
        request.mockImplementation(fakeIconik([], [uuid(2)]));
        const { node, outputs } = makeNode([uuid(1), uuid(2), uuid(3)]);

        await node.execute();

        expect(outputs.get("Added IDs")).toEqual([uuid(1), uuid(3)]);
        expect(outputs.get("Failed")).toEqual([{ id: uuid(2), error: "Iconik returned 400: Object does not exist" }]);
        expect(outputs.get("Failed count")).toBe(1);
    });

    it("fails when every object fails", async () => {
        request.mockImplementation(fakeIconik([], [uuid(1), uuid(2)]));
        await expect(makeNode([uuid(1), uuid(2)]).node.execute()).rejects.toThrow(
            `none of the 2 objects could be added to collection "${COLLECTION}"`
        );
    });

    it("stops at once when the collection does not exist", async () => {
        request.mockResolvedValue(reply(404, { errors: ["Collection not found"] }));
        await expect(makeNode([uuid(1), uuid(2), uuid(3)]).node.execute()).rejects.toThrow(
            `Could not add to collection: collection "${COLLECTION}" — Iconik returned 404: Collection not found`
        );
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("stops at once on an authentication failure and says how many were added", async () => {
        request.mockResolvedValueOnce(reply(201)).mockResolvedValueOnce(reply(401, { errors: ["Token is invalid"] }));
        await expect(makeNode([uuid(1), uuid(2), uuid(3)]).node.execute()).rejects.toThrow(
            "Iconik authentication failed — Iconik returned 401: Token is invalid — 1 of 3 objects were already added"
        );
    });

    it.each([
        [{ "Collection ID": "abc" }, [uuid(1)], 'Collection ID "abc" is not a UUID'],
        [{}, [], "Object IDs is empty"],
        [{}, ["x"], 'Object IDs "x" is not a UUID'],
        [{ "Object Type": "segments" }, [uuid(1)], 'Object Type "segments" is not supported'],
    ])("rejects %p %p before calling Iconik", async (override, ids, message) => {
        await expect(makeNode(ids, override).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("stops at once when Iconik cannot be reached", async () => {
        request.mockRejectedValue(new Error("connect ECONNREFUSED"));
        await expect(makeNode([uuid(1), uuid(2), uuid(3)]).node.execute()).rejects.toThrow(
            /^Could not add to collection — the request to Iconik failed: connect ECONNREFUSED/
        );
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("lists a still rate-limited object with the same reason format as other failures", async () => {
        request
            .mockResolvedValueOnce(reply(201))
            .mockResolvedValue({
                status: 429,
                data: { errors: ["Too many requests"] },
                headers: { "retry-after": "0" },
                statusText: "",
                config: {},
            });
        const { node, outputs } = makeNode([uuid(1), uuid(2)]);

        await node.execute();

        expect(outputs.get("Failed")).toEqual([{ id: uuid(2), error: "Iconik returned 429: Too many requests" }]);
    });

    it("checks membership only for 400/409, not for server errors", async () => {
        request.mockResolvedValueOnce(reply(201)).mockResolvedValueOnce(reply(503, { errors: ["Service unavailable"] }));
        const { node, outputs } = makeNode([uuid(1), uuid(2)]);

        await node.execute();

        expect(request.mock.calls.every((c) => (c[0] as AxiosRequestConfig).method === "POST")).toBe(true);
        expect(outputs.get("Failed")).toEqual([{ id: uuid(2), error: "Iconik returned 503: Service unavailable" }]);
    });

    it("keeps the Curl output and the 'nothing added' message short for many objects", async () => {
        const ids = Array.from({ length: 12 }, (_, i) => uuid(i + 1));
        request.mockImplementation(fakeIconik([], ids));
        const { node, outputs } = makeNode(ids);

        await expect(node.execute()).rejects.toThrow(/and 7 more$/);
        expect((outputs.get("Curl") as string).split("\n\n")).toHaveLength(1);
    });
});
