/**
 * Input checks shared by the Iconik nodes. Each one trims what the user entered
 * and fails with a "Could not <action> — …" message before any request is sent.
 */
import { IconikObjectType } from "../enums/IconikObjectType";

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isUuid(value: string): boolean {
    return UUID_PATTERN.test(value);
}

/** Trims an ID input and checks it is a UUID, the format of every Iconik ID. */
export function requireUuid(value: unknown, inputName: string, action: string): string {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (!isUuid(trimmed)) {
        throw new Error(`Could not ${action} — ${inputName} "${trimmed}" is not a UUID — enter the ${inputName} from Iconik`);
    }
    return trimmed;
}

/** Like requireUuid for an optional ID input: an empty value returns undefined, anything else must be a UUID. */
export function optionalUuid(value: unknown, inputName: string, action: string): string | undefined {
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed.length === 0 ? undefined : requireUuid(trimmed, inputName, action);
}

/** Trims an optional text input; an empty value returns undefined so it is left out of the request. */
export function optionalText(value: unknown): string | undefined {
    const trimmed = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
    return trimmed.length === 0 ? undefined : trimmed;
}

/** Checks an optional URL input: empty returns undefined, otherwise it must be an absolute URL with a scheme. */
export function optionalUrl(value: unknown, inputName: string, action: string): string | undefined {
    const url = optionalText(value);
    if (url === undefined) return undefined;
    try {
        new URL(url);
    } catch {
        throw new Error(`Could not ${action} — ${inputName} "${url}" is not a URL — enter a full URL such as https://example.com/clip`);
    }
    return url;
}

/** Checks a whole-number input against its range; empty uses the fallback. */
export function requireWholeNumber(
    value: unknown,
    inputName: string,
    action: string,
    min: number,
    max: number | undefined,
    fallback: number
): number {
    const empty = value === undefined || value === null || (typeof value === "string" && value.trim() === "");
    const number = empty ? fallback : Number(value);
    if (!Number.isInteger(number) || number < min || (max !== undefined && number > max)) {
        const range = max !== undefined ? `a whole number from ${min} to ${max}` : `a whole number of at least ${min}`;
        throw new Error(`Could not ${action} — ${inputName} "${String(value)}" is out of range — enter ${range}`);
    }
    return number;
}

/**
 * Checks a select input against its option values; empty uses the fallback.
 * `choices` lists the option labels for the error message.
 */
export function requireOption<T extends string>(
    value: unknown,
    allowed: readonly T[],
    fallback: T,
    inputName: string,
    action: string,
    choices: string
): T {
    const option = (optionalText(value) ?? fallback) as T;
    if (!allowed.includes(option)) {
        throw new Error(`Could not ${action} — ${inputName} "${option}" is not supported — choose ${choices}`);
    }
    return option;
}

/** Reads an Object Type select (Assets / Collections); Assets when empty. */
export function requireObjectType(value: unknown, inputName: string, action: string): IconikObjectType {
    return requireOption(value, Object.values(IconikObjectType), IconikObjectType.ASSETS, inputName, action, "Assets or Collections");
}

/** Parses a JSON input that may arrive as text or, through a wildcard, as the value itself. Empty returns undefined. */
export function parseJsonInput(raw: unknown, inputName: string, action: string): unknown {
    if (raw === undefined || raw === null) return undefined;
    if (typeof raw !== "string") return raw;
    if (raw.trim().length === 0) return undefined;
    try {
        return JSON.parse(raw);
    } catch {
        throw new Error(`Could not ${action} — ${inputName} is not valid JSON — check the brackets and quotes`);
    }
}

/**
 * Reads a list of Iconik IDs. Accepts a list input, a single string, and
 * entries that hold several IDs: a JSON list (what a wildcard to another node's
 * list output resolves to) or IDs separated by commas, semicolons or new lines.
 * Every ID must be a UUID; duplicates are dropped, the first occurrence keeps its place.
 */
export function parseIdList(value: unknown, inputName: string, action: string): string[] {
    const entries: unknown[] = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
    const ids: string[] = [];
    const expand = (entry: unknown): void => {
        if (Array.isArray(entry)) return entry.forEach(expand);
        if (typeof entry !== "string") {
            if (entry !== undefined && entry !== null)
                throw new Error(`Could not ${action} — ${inputName} contains a value that is not text`);
            return;
        }
        const trimmed = entry.trim();
        if (trimmed.startsWith("[")) {
            let parsed: unknown;
            try {
                parsed = JSON.parse(trimmed);
            } catch {
                throw new Error(`Could not ${action} — ${inputName} contains "${trimmed}", which is not a valid list`);
            }
            return expand(parsed);
        }
        trimmed
            .split(/[,;\n\r]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0)
            .forEach((part) => ids.push(requireUuid(part, inputName, action)));
    };
    entries.forEach(expand);
    const unique = [...new Set(ids)];
    if (unique.length === 0) {
        throw new Error(`Could not ${action} — ${inputName} is empty — enter at least one ID`);
    }
    return unique;
}

/** Splits a list into consecutive chunks of at most `size` entries. */
export function chunk<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
    return chunks;
}
