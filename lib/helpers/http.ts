/**
 * The Iconik HTTP client every node uses: connection, URLs, headers, the Curl
 * redaction, sending with rate-limit retries, and paging.
 */
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { IconikApiError, MAX_ATTEMPTS, extractIconikMessage } from "./errors";

export const DEFAULT_ICONIK_URL = "https://app.iconik.io";
/** Fetch All stops after this many objects. */
export const FETCH_ALL_CAP = 10_000;
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRY_WAIT_MS = 60_000;

export type IconikService = "assets" | "files" | "metadata" | "search";
type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface IconikConnection {
    baseUrl: string;
    appId: string;
    authToken: string;
}

export interface RetryOptions {
    /** Waits between attempts; replaced in tests. */
    sleep?: (ms: number) => Promise<void>;
    /** Polled before each retry and between pages so a canceled stream stops. */
    isCanceled?: () => boolean;
}

/** The page envelope every Iconik list and search endpoint returns. */
export interface IconikPage<T> {
    objects?: T[];
    page?: number;
    pages?: number;
    per_page?: number;
    total?: number;
    next_url?: string | null;
    [key: string]: unknown;
}

/** True for an absolute http(s) URL with a host and nothing unparseable in it. */
function isHttpUrl(value: string): boolean {
    if (/\s/.test(value)) return false;
    try {
        const url = new URL(value);
        return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
    } catch {
        return false;
    }
}

/** Trims the Iconik URL input, falls back to the default and drops trailing slashes. */
export function normalizeBaseUrl(raw: string | undefined): string {
    const trimmed = (raw ?? "").trim();
    if (trimmed.length === 0) return DEFAULT_ICONIK_URL;
    if (!isHttpUrl(trimmed)) {
        throw new Error(
            `Could not connect to Iconik — the Iconik URL "${trimmed}" is not an http(s) URL — enter the base URL, e.g. ${DEFAULT_ICONIK_URL}`
        );
    }
    return trimmed.replace(/\/+$/, "");
}

/**
 * Reads the three connection inputs every Iconik node has. Empty credentials
 * fail before any request; the URL falls back to the default instance.
 */
export function readConnection(appId: unknown, authToken: unknown, iconikUrl: unknown): IconikConnection {
    const id = typeof appId === "string" ? appId.trim() : "";
    const token = typeof authToken === "string" ? authToken.trim() : "";
    if (id.length === 0 || token.length === 0) {
        throw new Error(
            "Iconik authentication failed — the App ID or Auth Token is empty — enter both or wire them from a Get Secret node"
        );
    }
    return { appId: id, authToken: token, baseUrl: normalizeBaseUrl(typeof iconikUrl === "string" ? iconikUrl : undefined) };
}

/** Builds the request headers Iconik expects on every call. */
function iconikHeaders(connection: IconikConnection): Record<string, string> {
    return {
        "App-ID": connection.appId,
        "Auth-Token": connection.authToken,
        "Content-Type": "application/json",
        Accept: "application/json",
    };
}

/** Path segments are URL-encoded and joined; Iconik paths always end with a slash, without it Iconik redirects. */
export function buildIconikUrl(baseUrl: string, service: IconikService, segments: string[]): string {
    const path = segments.map((segment) => encodeURIComponent(segment)).join("/");
    return `${baseUrl}/API/${service}/v1/${path}/`;
}

/** Builds the axios config for one Iconik call; send it with sendIconikRequest and redact it for the Curl output. */
export function iconikRequestConfig(
    connection: IconikConnection,
    method: HttpMethod,
    service: IconikService,
    segments: string[],
    extra: { params?: Record<string, unknown>; data?: unknown } = {}
): AxiosRequestConfig {
    return {
        method,
        url: buildIconikUrl(connection.baseUrl, service, segments),
        headers: iconikHeaders(connection),
        ...(extra.params ? { params: extra.params } : {}),
        ...(extra.data !== undefined ? { data: extra.data } : {}),
    };
}

/** Copy of the request config with both credentials replaced by placeholders, safe for the Curl output. */
export function redactRequest(config: AxiosRequestConfig): AxiosRequestConfig {
    return {
        ...config,
        headers: { ...(config.headers as Record<string, string>), "App-ID": "<your-app-id>", "Auth-Token": "<your-auth-token>" },
    };
}

/**
 * Wait before the next attempt after a 429. Respects Retry-After (seconds or
 * HTTP date); otherwise backs off 1 s, 2 s, … Capped so a misbehaving header
 * cannot hang the stream.
 */
export function retryDelayMs(retryAfter: string | undefined, attempt: number, now: number = Date.now()): number {
    let delay = 1000 * 2 ** (attempt - 1);
    if (retryAfter !== undefined && retryAfter.trim() !== "") {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) {
            delay = seconds * 1000;
        } else {
            const date = Date.parse(retryAfter);
            if (!Number.isNaN(date)) delay = Math.max(0, date - now);
        }
    }
    return Math.min(delay, MAX_RETRY_WAIT_MS);
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Sends one request to Iconik. Retries on 429 up to MAX_ATTEMPTS in total,
 * throws IconikApiError for any other non-2xx answer, and lets network errors
 * (no response) propagate unchanged.
 */
export async function sendIconikRequest<T>(config: AxiosRequestConfig, options: RetryOptions = {}): Promise<T> {
    const sleep = options.sleep ?? defaultSleep;
    for (let attempt = 1; ; attempt++) {
        const response: AxiosResponse = await axios.request({ timeout: REQUEST_TIMEOUT_MS, ...config, validateStatus: () => true });
        if (response.status >= 200 && response.status < 300) {
            return response.data as T;
        }
        if (response.status === 429 && attempt < MAX_ATTEMPTS) {
            const retryAfter = response.headers?.["retry-after"] as string | undefined;
            await sleep(retryDelayMs(retryAfter, attempt));
            if (options.isCanceled?.()) {
                throw new Error(
                    "Could not finish the Iconik request — the stream was canceled while waiting to retry — run the stream again"
                );
            }
            continue;
        }
        throw new IconikApiError(response.status, extractIconikMessage(response.data));
    }
}

export interface AllPagesResult<T> {
    objects: T[];
    total: number | undefined;
    pagesFetched: number;
    /** Iconik's page count from the last response. */
    pages: number | undefined;
    /** The last page response, unchanged. */
    lastResponse: IconikPage<T> | undefined;
    /** True when maxItems stopped the walk while Iconik had more objects. */
    truncated: boolean;
}

/**
 * Fetches pages 1, 2, … of a list or search request until Iconik reports the
 * last page, an empty page arrives, or `maxItems` objects are collected.
 * Checks for cancellation between pages.
 */
export async function fetchAllPages<T>(
    config: AxiosRequestConfig,
    perPage: number,
    maxItems: number | undefined,
    options: RetryOptions = {}
): Promise<AllPagesResult<T>> {
    const objects: T[] = [];
    let total: number | undefined;
    let pages: number | undefined;
    let lastResponse: IconikPage<T> | undefined;
    let truncated = false;
    let page = 1;
    for (;;) {
        let response: IconikPage<T>;
        try {
            response = await sendIconikRequest<IconikPage<T>>(
                { ...config, params: { ...(config.params as Record<string, unknown>), page, per_page: perPage } },
                options
            );
        } catch (err: unknown) {
            if (err instanceof IconikApiError) err.page = page;
            throw err;
        }
        lastResponse = response;
        const batch = response.objects ?? [];
        total = response.total ?? total;
        pages = response.pages ?? pages;
        objects.push(...batch);
        const lastPage = response.pages !== undefined ? page >= response.pages : batch.length < perPage;
        if (batch.length === 0 || lastPage) break;
        if (maxItems !== undefined && objects.length >= maxItems) {
            truncated = true;
            break;
        }
        if (options.isCanceled?.()) {
            throw new Error("Could not finish the Iconik request — the stream was canceled while fetching pages — run the stream again");
        }
        page++;
    }
    if (maxItems !== undefined && objects.length > maxItems) truncated = true;
    return {
        objects: maxItems !== undefined ? objects.slice(0, maxItems) : objects,
        total,
        pagesFetched: page,
        pages,
        lastResponse,
        truncated,
    };
}

/** The result a list node outputs, whether it fetched one page or all of them. */
export interface ListResult<T> {
    objects: T[];
    total: number;
    page: number;
    pages: number;
    response: IconikPage<T>;
    /** True when Fetch All stopped at the cap while Iconik had more objects. */
    truncated: boolean;
}

/**
 * Runs a list or search request the way the Page / Results per Page / Fetch All
 * inputs describe: one page, or every page up to `cap` objects. The request
 * config must already carry page and per_page.
 */
export async function fetchList<T>(
    config: AxiosRequestConfig,
    options: { page: number; perPage: number; fetchAll: boolean; cap: number },
    retry: RetryOptions
): Promise<ListResult<T>> {
    if (options.fetchAll) {
        const all = await fetchAllPages<T>(config, options.perPage, options.cap, retry);
        return {
            objects: all.objects,
            total: all.total ?? all.objects.length,
            page: all.pagesFetched,
            pages: all.pages ?? all.pagesFetched,
            response: all.lastResponse ?? {},
            truncated: all.truncated,
        };
    }
    const response = await sendIconikRequest<IconikPage<T>>(config, retry);
    const objects = response.objects ?? [];
    const page = response.page ?? options.page;
    return { objects, total: response.total ?? objects.length, page, pages: response.pages ?? page, response, truncated: false };
}

/** The warning a list node outputs when Fetch All stopped at the cap. */
export function fetchAllWarning(total: number, noun: string, hint: string): string {
    return `Fetch All stopped at ${FETCH_ALL_CAP} objects; Iconik reports ${total} ${noun}. ${hint}`;
}

/** The IDs of the objects in a list, skipping objects without one. */
export function objectIds(objects: { id?: unknown }[]): string[] {
    return objects.map((o) => o.id).filter((id): id is string => typeof id === "string");
}
