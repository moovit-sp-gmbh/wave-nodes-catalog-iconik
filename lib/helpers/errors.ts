/**
 * Error handling shared by every Iconik node. Iconik has no error codes of its
 * own, so its HTTP status and error text are passed through unchanged; only
 * the context the user needs to find the object is added.
 */

/** Requests are tried this many times in total when Iconik rate-limits them (429). */
export const MAX_ATTEMPTS = 3;

/** Thrown for any non-2xx answer from Iconik; nodes turn it into their failure message with toNodeError. */
export class IconikApiError extends Error {
    /** The page that failed, when the request was one page of a Fetch All walk. */
    page?: number;

    constructor(
        readonly status: number,
        readonly iconikMessage: string
    ) {
        super(`Iconik returned ${status}: ${iconikMessage}`);
        this.name = "IconikApiError";
    }
}

/** What the failing node was doing: `action` completes "Could not …", `target` names the object for a 404. */
export interface ErrorContext {
    action: string;
    target?: string;
}

/**
 * Pulls Iconik's own error text out of a response body without changing it.
 * Iconik's documented error body is `{ "errors": [...] }` or, for per-field
 * problems, `{ "errors": { "<field>": "<message>" } }`.
 */
export function extractIconikMessage(data: unknown): string {
    if (data === undefined || data === null || data === "") return "no error details returned";
    if (typeof data === "string") return data;
    if (typeof data === "object") {
        const body = data as Record<string, unknown>;
        const asText = (e: unknown) => (typeof e === "string" ? e : JSON.stringify(e));
        if (Array.isArray(body.errors) && body.errors.length > 0) {
            return body.errors.map(asText).join("; ");
        }
        if (body.errors && typeof body.errors === "object" && !Array.isArray(body.errors) && Object.keys(body.errors).length > 0) {
            return Object.entries(body.errors as Record<string, unknown>)
                .map(([field, message]) => `${field}: ${asText(message)}`)
                .join("; ");
        }
        if (typeof body.error === "string") return body.error;
        if (typeof body.message === "string") return body.message;
    }
    return JSON.stringify(data);
}

/** Builds the failure message for an Iconik error response. */
export function describeIconikError(err: IconikApiError, context: ErrorContext): string {
    const iconik = `Iconik returned ${err.status}: ${err.iconikMessage}`;
    switch (err.status) {
        case 401:
        case 403:
            return `Iconik authentication failed — ${iconik}`;
        case 404:
            return context.target
                ? `Could not ${context.action}: ${context.target} — ${iconik}`
                : `Could not ${context.action} — ${iconik}`;
        case 429:
            return `Could not ${context.action} after ${MAX_ATTEMPTS} attempts — ${iconik}`;
        default:
            return `Could not ${context.action} — ${iconik}`;
    }
}

/** The credentials that must never appear in an error message. */
export interface Secrets {
    appId: string;
    authToken: string;
}

/** Shorter values are not real Iconik credentials; replacing them would garble ordinary words in the message. */
const MIN_SECRET_LENGTH = 6;

/** Replaces the App ID and Auth Token wherever they appear, because Iconik's own text is passed through. */
export function redactSecrets(message: string, secrets: Secrets): string {
    let redacted = message;
    for (const [secret, placeholder] of [
        [secrets.authToken, "<your-auth-token>"],
        [secrets.appId, "<your-app-id>"],
    ]) {
        if (secret.length >= MIN_SECRET_LENGTH) redacted = redacted.split(secret).join(placeholder);
    }
    return redacted;
}

/** Turns anything thrown while talking to Iconik into the error the node fails with. */
export function toNodeError(err: unknown, context: ErrorContext, secrets: Secrets): Error {
    let message: string;
    if (err instanceof IconikApiError) {
        message = describeIconikError(err, context);
    } else {
        const raw = (err as Error)?.message ?? "unknown error";
        message = raw.startsWith("Could not")
            ? raw
            : `Could not ${context.action} — the request to Iconik failed: ${raw} — check the Iconik URL and network connectivity`;
    }
    return new Error(redactSecrets(message, secrets));
}
