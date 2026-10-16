import axios, { AxiosRequestConfig } from "axios";
import CreateCollection from "../../lib/nodes/iconikCollections/CreateCollection";
import { IconikCollection } from "../../lib/helpers/collections";

const AUTH_TOKEN = "secret-token-value";
const PARENT = "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const NEW_ID = "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function makeNode(overrides: Record<string, unknown> = {}) {
    const outputs = new Map<string, unknown>();
    const inputs: Record<string, unknown> = {
        "App ID": "app-id-value",
        "Auth Token": AUTH_TOKEN,
        "Collection Title": "Campaign Summer 2026",
        ...overrides,
    };
    const node = new CreateCollection();
    node.wave = {
        inputs: { getInputValueByInputName: (name: string) => inputs[name] },
        outputs: { setOutput: (name: string, value: unknown) => outputs.set(name, value) },
        axiosHelper: { convertRequestToCurl: (config: AxiosRequestConfig) => JSON.stringify(config) },
        general: { isCanceled: () => false },
    } as unknown as CreateCollection["wave"];
    return { node, outputs };
}

function reply(status: number, data: unknown) {
    return { status, data, headers: {}, statusText: "", config: {} };
}

/** Fake Iconik: a parent, its child collections spread over pages, root collections, and create. */
function fakeIconik(children: IconikCollection[], options: { parentStatus?: string; roots?: IconikCollection[] } = {}) {
    return (config: AxiosRequestConfig) => {
        const url = config.url ?? "";
        const params = (config.params ?? {}) as Record<string, number>;
        const pageOf = (items: IconikCollection[]) => {
            const per = params.per_page,
                page = params.page;
            return reply(200, {
                objects: items.slice((page - 1) * per, page * per),
                page,
                pages: Math.max(1, Math.ceil(items.length / per)),
                total: items.length,
            });
        };
        if (config.method === "POST") return Promise.resolve(reply(201, { id: NEW_ID, status: "ACTIVE", ...(config.data as object) }));
        if (url.endsWith(`/collections/${PARENT}/`))
            return Promise.resolve(reply(200, { id: PARENT, status: options.parentStatus ?? "ACTIVE" }));
        if (url.endsWith(`/collections/${PARENT}/contents/`)) return Promise.resolve(pageOf(children));
        if (url.endsWith("/collections/")) return Promise.resolve(pageOf(options.roots ?? []));
        return Promise.resolve(reply(404, { errors: ["Collection does not exist"] }));
    };
}

const coll = (n: number, title: string, extra: Partial<IconikCollection> = {}): IconikCollection => ({
    id: uuid(n),
    title,
    status: "ACTIVE",
    object_type: "collections",
    date_created: `2026-01-${String(10 + (n % 10)).padStart(2, "0")}T00:00:00Z`,
    ...extra,
});
describe("CreateCollection.execute", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("creates a root collection when none with the title exists", async () => {
        request.mockImplementation(fakeIconik([], { roots: [coll(1, "Other")] }));
        const { node, outputs } = makeNode({ "External ID": "PRJ-4711", "Collection Category": "Project" });

        await node.execute();

        const calls = request.mock.calls.map((c) => c[0] as AxiosRequestConfig);
        expect(calls[0]).toMatchObject({
            method: "GET",
            url: "https://app.iconik.io/API/assets/v1/collections/",
            params: { is_root: true },
        });
        expect(calls[1]).toMatchObject({ method: "POST", url: "https://app.iconik.io/API/assets/v1/collections/" });
        expect(calls[1].data).toEqual({ title: "Campaign Summer 2026", is_root: true, external_id: "PRJ-4711", category: "Project" });
        expect(calls[1].params).toEqual({ apply_default_acls: true, apply_collection_acls: false });
        expect(outputs.get("Collection ID")).toBe(NEW_ID);
        expect(outputs.get("Created")).toBe(true);
        expect(outputs.get("Parent ID")).toBe("");
        expect(outputs.get("Curl")).not.toContain(AUTH_TOKEN);
    });

    it("returns the existing child on a later page instead of creating one", async () => {
        const children = Array.from({ length: 250 }, (_, i) => coll(i + 1, `Folder ${i + 1}`));
        children[230] = coll(231, "Campaign Summer 2026");
        request.mockImplementation(fakeIconik(children));
        const { node, outputs } = makeNode({ "Parent Collection ID": PARENT });

        await node.execute();

        const lookups = request.mock.calls.map((c) => c[0] as AxiosRequestConfig).filter((c) => c.url?.endsWith("/contents/"));
        expect(lookups.map((c) => c.params.page)).toEqual([1, 2, 3]);
        expect(lookups[0].params).toMatchObject({ object_types: "collections", per_page: 100 });
        expect(request.mock.calls.some((c) => (c[0] as AxiosRequestConfig).method === "POST")).toBe(false);
        expect(outputs.get("Collection ID")).toBe(uuid(231));
        expect(outputs.get("Created")).toBe(false);
    });

    it("fails with the exact message when If Exists is Fail", async () => {
        request.mockImplementation(fakeIconik([coll(7, "Campaign Summer 2026")]));
        await expect(makeNode({ "Parent Collection ID": PARENT, "If Exists": "fail" }).node.execute()).rejects.toThrow(
            "Collection 'Campaign Summer 2026' already exists"
        );
    });

    it("creates a duplicate inside the parent without looking when If Exists is Create New", async () => {
        request.mockImplementation(fakeIconik([coll(7, "Campaign Summer 2026")]));
        const { node, outputs } = makeNode({ "Parent Collection ID": PARENT, "If Exists": "create_new", "Apply Collection ACLs": true });

        await node.execute();

        const calls = request.mock.calls.map((c) => c[0] as AxiosRequestConfig);
        expect(calls.some((c) => c.url?.endsWith("/contents/"))).toBe(false);
        const post = calls.find((c) => c.method === "POST");
        expect(post?.data).toEqual({ title: "Campaign Summer 2026", parent_id: PARENT });
        expect(post?.params).toMatchObject({ apply_collection_acls: true });
        expect(outputs.get("Created")).toBe(true);
        expect(outputs.get("Parent ID")).toBe(PARENT);
    });

    it("refuses a deleted parent", async () => {
        request.mockImplementation(fakeIconik([], { parentStatus: "DELETED" }));
        await expect(makeNode({ "Parent Collection ID": PARENT }).node.execute()).rejects.toThrow(
            `the parent collection "${PARENT}" is deleted`
        );
        expect(request).toHaveBeenCalledTimes(1);
    });

    it.each([
        [{ "Collection Title": "  " }, /Collection Title is empty/],
        [{ "Parent Collection ID": "abc" }, /Parent Collection ID "abc" is not a UUID/],
        [{ "If Exists": "merge" }, /If Exists "merge" is not supported/],
        [{ "ACL Template ID": "x" }, /ACL Template ID "x" is not a UUID/],
    ])("rejects %p before calling Iconik", async (override, message) => {
        await expect(makeNode(override).node.execute()).rejects.toThrow(message);
        expect(request).not.toHaveBeenCalled();
    });

    it("names the parent when Iconik does not know it", async () => {
        request.mockResolvedValue(reply(404, { errors: ["Collection does not exist"] }));
        await expect(makeNode({ "Parent Collection ID": PARENT }).node.execute()).rejects.toThrow(
            `Could not create collection: parent collection "${PARENT}" — Iconik returned 404: Collection does not exist`
        );
    });

    it("fails instead of risking a duplicate when there are too many collections to check", async () => {
        request.mockImplementation((config: AxiosRequestConfig) => {
            const { page, per_page } = (config.params ?? {}) as { page: number; per_page: number };
            const objects = Array.from({ length: per_page }, (_, i) => coll((page - 1) * per_page + i + 1, "Other"));
            return Promise.resolve(reply(200, { objects, page, pages: 500, total: 50_000 }));
        });
        await expect(makeNode().node.execute()).rejects.toThrow(/more than 10000 collections at root level/);
        expect(request.mock.calls.some((c) => (c[0] as AxiosRequestConfig).method === "POST")).toBe(false);
    });
});
