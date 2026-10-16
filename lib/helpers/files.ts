/** Format and file types, and the choice of the file to download, for Get Original Download URL. */

export interface IconikFormat {
    id?: string;
    name?: string;
    archive_status?: string;
    is_online?: boolean;
    status?: string;
    [key: string]: unknown;
}

export interface IconikFile {
    id?: string;
    name?: string;
    original_name?: string;
    size?: number;
    format_id?: string;
    status?: string;
    [key: string]: unknown;
}

/** The message for an asset without an original, e.g. a placeholder. */
export function noOriginalMessage(assetId: string): string {
    return `Asset has no original file — asset "${assetId}" has no ORIGINAL format or no file in it — check that a file was uploaded or ingested for this asset`;
}

const FAILED = "Could not get original download URL";

/**
 * Picks the file to download: the first CLOSED file of the original format.
 * Fails with a specific message when the original is archived, offline,
 * still being written, or has no file at all.
 */
export function pickOriginalFile(assetId: string, format: IconikFormat, originalFiles: IconikFile[]): IconikFile {
    if (format.archive_status === "ARCHIVED" || format.archive_status === "ARCHIVING") {
        throw new Error(
            `${FAILED} — the original of asset "${assetId}" is archived (archive status ${format.archive_status}) — restore it in Iconik, then run the stream again`
        );
    }
    const closed = originalFiles.find((file) => file.status === "CLOSED");
    if (closed) return closed;
    if (originalFiles.length === 0) throw new Error(noOriginalMessage(assetId));
    const statuses = [...new Set(originalFiles.map((file) => file.status ?? "unknown"))];
    if (statuses.includes("ARCHIVED")) {
        throw new Error(
            `${FAILED} — the original file of asset "${assetId}" is archived — restore it in Iconik, then run the stream again`
        );
    }
    if (statuses.includes("MISSING") || format.is_online === false) {
        throw new Error(
            `${FAILED} — the original file of asset "${assetId}" is offline (file status ${statuses.join(", ")}) — check the storage the file is on`
        );
    }
    throw new Error(
        `${FAILED} — the original file of asset "${assetId}" is not complete (file status ${statuses.join(", ")}) — wait until Iconik has finished the upload or transfer`
    );
}
