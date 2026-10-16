/** The object types Iconik uses in URLs and bodies for assets and collections. */
export enum IconikObjectType {
    ASSETS = "assets",
    COLLECTIONS = "collections",
}

/** Iconik's comma-separated form for "both types", as used by search doc_types and the contents object_types filter. */
export const ASSETS_AND_COLLECTIONS = `${IconikObjectType.ASSETS},${IconikObjectType.COLLECTIONS}`;

/** Select options for an Object Type input: one asset or collection. */
export const SINGLE_OBJECT_TYPE_OPTIONS: Record<string, string> = {
    Assets: IconikObjectType.ASSETS,
    Collections: IconikObjectType.COLLECTIONS,
};

/** Select options for an Object Types input that can also cover both. */
export const OBJECT_TYPE_OR_BOTH_OPTIONS: Record<string, string> = {
    Assets: IconikObjectType.ASSETS,
    Collections: IconikObjectType.COLLECTIONS,
    "Assets and Collections": ASSETS_AND_COLLECTIONS,
};

/** The values an Object Types input accepts. */
export const OBJECT_TYPE_OR_BOTH_VALUES: string[] = Object.values(OBJECT_TYPE_OR_BOTH_OPTIONS);
