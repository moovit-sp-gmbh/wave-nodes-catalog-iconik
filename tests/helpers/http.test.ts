import axios from "axios";
import { IconikApiError } from "../../lib/helpers/errors";
import {
    DEFAULT_ICONIK_URL,
    buildIconikUrl,
    fetchAllPages,
    fetchList,
    iconikRequestConfig,
    normalizeBaseUrl,
    objectIds,
    readConnection,
    redactRequest,
    retryDelayMs,
    sendIconikRequest,
} from "../../lib/helpers/http";

const page = (n: number, pages: number, objects: unknown[]) => ({ status: 200, headers: {}, data: { objects, page: n, pages, total: 5 } });

describe("connection and URLs", () => {
    it("normalizes the Iconik URL", () => {
        expect(normalizeBaseUrl(undefined)).toBe(DEFAULT_ICONIK_URL);
        expect(normalizeBaseUrl("  ")).toBe(DEFAULT_ICONIK_URL);
        expect(normalizeBaseUrl("https://eu.iconik.io//")).toBe("https://eu.iconik.io");
        expect(() => normalizeBaseUrl("eu.iconik.io")).toThrow(/is not an http\(s\) URL/);
        expect(() => normalizeBaseUrl("https://app.iconik.io extra")).toThrow(/is not an http\(s\) URL/);
        expect(() => normalizeBaseUrl("ftp://app.iconik.io")).toThrow(/is not an http\(s\) URL/);
        expect(normalizeBaseUrl("http://localhost:8080/")).toBe("http://localhost:8080");
    });

    it("reads the connection and rejects empty credentials", () => {
        expect(readConnection(" id ", " token ", undefined)).toEqual({ appId: "id", authToken: "token", baseUrl: DEFAULT_ICONIK_URL });
        expect(readConnection("id", "token", "https://eu.iconik.io/").baseUrl).toBe("https://eu.iconik.io");
        expect(() => readConnection("", "token", undefined)).toThrow(/^Iconik authentication failed/);
        expect(() => readConnection("id", undefined, undefined)).toThrow(/^Iconik authentication failed/);
    });

    it("builds URLs with encoded segments and a trailing slash", () => {
        expect(buildIconikUrl("https://app.iconik.io", "assets", ["assets", "a b"])).toBe(
            "https://app.iconik.io/API/assets/v1/assets/a%20b/"
        );
        const config = iconikRequestConfig(
            { appId: "id", authToken: "t", baseUrl: "https://x.io" },
            "GET",
            "files",
            ["assets", "1", "files"],
            {
                params: { per_page: 5 },
            }
        );
        expect(config).toMatchObject({ method: "GET", url: "https://x.io/API/files/v1/assets/1/files/", params: { per_page: 5 } });
        expect(config.headers).toMatchObject({ "App-ID": "id", "Auth-Token": "t", "Content-Type": "application/json" });
        expect(config).not.toHaveProperty("data");
    });

    it("replaces both credentials in a redacted request", () => {
        const redacted = redactRequest({ headers: { "App-ID": "id", "Auth-Token": "token", Accept: "application/json" } });
        expect(redacted.headers).toEqual({ "App-ID": "<your-app-id>", "Auth-Token": "<your-auth-token>", Accept: "application/json" });
    });

    it("collects object IDs and skips objects without one", () => {
        expect(objectIds([{ id: "a" }, {}, { id: 5 }, { id: "b" }])).toEqual(["a", "b"]);
    });
});

describe("sendIconikRequest", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("computes the retry delay from Retry-After or backoff", () => {
        expect(retryDelayMs("2", 1)).toBe(2000);
        expect(retryDelayMs(undefined, 1)).toBe(1000);
        expect(retryDelayMs(undefined, 2)).toBe(2000);
        expect(retryDelayMs("3600", 1)).toBe(60_000);
        expect(retryDelayMs("Thu, 15 Oct 2026 10:00:05 GMT", 1, Date.parse("2026-10-15T10:00:00Z"))).toBe(5000);
    });

    it("waits the Retry-After time between attempts", async () => {
        request
            .mockResolvedValueOnce({ status: 429, data: {}, headers: { "retry-after": "3" } })
            .mockResolvedValueOnce({ status: 200, data: { ok: true }, headers: {} });
        const sleep = jest.fn().mockResolvedValue(undefined);

        await expect(sendIconikRequest({ url: "x" }, { sleep })).resolves.toEqual({ ok: true });
        expect(sleep).toHaveBeenCalledWith(3000);
    });

    it("gives up after 3 rate-limited attempts", async () => {
        request.mockResolvedValue({ status: 429, data: { errors: ["slow down"] }, headers: {} });
        const error = await sendIconikRequest({ url: "x" }, { sleep: async () => {} }).catch((e: unknown) => e);
        expect((error as IconikApiError).status).toBe(429);
        expect(request).toHaveBeenCalledTimes(3);
    });

    it("stops retrying when the stream is canceled", async () => {
        request.mockResolvedValue({ status: 429, data: {}, headers: {} });
        await expect(sendIconikRequest({ url: "x" }, { sleep: async () => {}, isCanceled: () => true })).rejects.toThrow(
            /stream was canceled/
        );
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("throws IconikApiError with status and message", async () => {
        request.mockResolvedValue({ status: 500, data: { errors: ["boom"] }, headers: {} });
        const error = await sendIconikRequest({ url: "x" }).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(IconikApiError);
        expect((error as IconikApiError).status).toBe(500);
        expect((error as IconikApiError).iconikMessage).toBe("boom");
    });
});

describe("paging", () => {
    let request: jest.SpyInstance;
    beforeEach(() => {
        request = jest.spyOn(axios, "request");
    });
    afterEach(() => request.mockRestore());

    it("walks every page until the last one", async () => {
        request
            .mockResolvedValueOnce(page(1, 3, [1, 2]))
            .mockResolvedValueOnce(page(2, 3, [3, 4]))
            .mockResolvedValueOnce(page(3, 3, [5]));

        const result = await fetchAllPages<number>({ url: "x", params: { q: 1 } }, 2, undefined);

        expect(result).toMatchObject({ objects: [1, 2, 3, 4, 5], total: 5, pagesFetched: 3, pages: 3, truncated: false });
        expect(result.lastResponse?.page).toBe(3);
        expect(request.mock.calls.map((c) => c[0].params)).toEqual([
            { q: 1, page: 1, per_page: 2 },
            { q: 1, page: 2, per_page: 2 },
            { q: 1, page: 3, per_page: 2 },
        ]);
    });

    it("stops at maxItems and on an empty page", async () => {
        request.mockResolvedValueOnce(page(1, 3, [1, 2])).mockResolvedValueOnce(page(2, 3, [3, 4]));
        const capped = await fetchAllPages<number>({ url: "x" }, 2, 3);
        expect(capped.objects).toEqual([1, 2, 3]);
        expect(capped.truncated).toBe(true);
        expect(request).toHaveBeenCalledTimes(2);

        request.mockReset().mockResolvedValueOnce(page(1, 9, []));
        expect((await fetchAllPages<number>({ url: "x" }, 2, undefined)).objects).toEqual([]);
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("stops between pages when the stream is canceled", async () => {
        request.mockResolvedValue(page(1, 5, [1, 2]));
        await expect(fetchAllPages({ url: "x" }, 2, undefined, { isCanceled: () => true })).rejects.toThrow(
            /canceled while fetching pages/
        );
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("fetchList returns one page as Iconik reports it", async () => {
        request.mockResolvedValue(page(2, 3, [3, 4]));
        const result = await fetchList<number>(
            { url: "x", params: { page: 2, per_page: 2 } },
            { page: 2, perPage: 2, fetchAll: false, cap: 10 },
            {}
        );
        expect(result).toMatchObject({ objects: [3, 4], total: 5, page: 2, pages: 3, truncated: false });
        expect(request).toHaveBeenCalledTimes(1);
    });

    it("fetchList walks all pages up to the cap", async () => {
        request.mockResolvedValueOnce(page(1, 3, [1, 2])).mockResolvedValueOnce(page(2, 3, [3, 4]));
        const result = await fetchList<number>({ url: "x" }, { page: 1, perPage: 2, fetchAll: true, cap: 3 }, {});
        expect(result).toMatchObject({ objects: [1, 2, 3], total: 5, page: 2, pages: 3, truncated: true });
        expect(result.response.page).toBe(2);
    });
});
