/** Collection types and lookups used by Create Collection and Add to Collection. */
import { IconikObjectType } from "../enums/IconikObjectType";
import { IconikConnection, IconikPage, RetryOptions, iconikRequestConfig, sendIconikRequest } from "./http";

export interface IconikCollection {
    id?: string;
    title?: string;
    status?: string;
    object_type?: string;
    parent_id?: string | null;
    date_created?: string;
    [key: string]: unknown;
}

/** One object Add to Collection could not add. */
export interface FailedObject {
    id: string;
    error: string;
}

/**
 * Picks the existing collection with this title: same trimmed title (case-sensitive),
 * status ACTIVE, a collection rather than an asset. Several matches → the oldest.
 */
export function findExistingCollection(candidates: IconikCollection[], title: string): IconikCollection | undefined {
    const matches = candidates.filter(
        (c) =>
            (c.object_type === undefined || c.object_type === IconikObjectType.COLLECTIONS) &&
            c.status === "ACTIVE" &&
            typeof c.title === "string" &&
            c.title.trim() === title
    );
    const created = (c: IconikCollection) => {
        const time = Date.parse(c.date_created ?? "");
        return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
    };
    return matches.sort((a, b) => created(a) - created(b))[0];
}

/** Asks Iconik whether the object is already in the collection, using the documented object_ids filter. */
export async function isAlreadyInCollection(
    connection: IconikConnection,
    collectionId: string,
    objectType: IconikObjectType,
    objectId: string,
    retry: RetryOptions
): Promise<boolean> {
    try {
        const config = iconikRequestConfig(connection, "GET", "assets", ["collections", collectionId, "contents"], {
            params: { object_ids: objectId, object_types: objectType, include_keyframes: false },
        });
        const page = await sendIconikRequest<IconikPage<{ id?: string }>>(config, retry);
        return (page.objects ?? []).some((o) => o.id === objectId);
    } catch {
        return false;
    }
}
