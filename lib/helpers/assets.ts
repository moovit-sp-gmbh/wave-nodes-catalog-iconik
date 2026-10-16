/** Asset types and request bodies used by Upload File and Update Asset. */
import { optionalText, optionalUrl, optionalUuid, requireOption } from "./inputs";

/** Asset types Iconik accepts (AssetCreateSchema.type in the assets spec). */
export const ASSET_TYPES = ["ASSET", "SEQUENCE", "NLE_PROJECT", "PLACEHOLDER", "CUSTOM", "LINK", "SUBCLIP"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** The asset fields the nodes read; everything else stays in the raw Asset output. */
export interface IconikAsset {
    id?: string;
    title?: string;
    status?: string;
    type?: string;
    in_collections?: string[];
    [key: string]: unknown;
}

export interface CreateAssetFields {
    title: unknown;
    type: unknown;
    collectionId: unknown;
    externalLink: unknown;
    externalId: unknown;
    category: unknown;
}

export interface CreateAssetBody {
    title: string;
    type: AssetType;
    collection_id?: string;
    external_link?: string;
    external_id?: string;
    category?: string;
}

const UPDATE_ACTION = "update asset";

/**
 * Validates the fields of a new asset and builds the POST /assets/ body; empty optional fields are left out.
 * `action` completes the "Could not …" failure messages of the calling node.
 */
export function buildCreateAssetBody(fields: CreateAssetFields, action: string): CreateAssetBody {
    const title = optionalText(fields.title);
    if (title === undefined) {
        throw new Error(`Could not ${action} — Asset Title is empty — enter a title for the new asset`);
    }
    const type = requireOption(fields.type, ASSET_TYPES, "ASSET", "Asset Type", action, `one of ${ASSET_TYPES.join(", ")}`);
    const body: CreateAssetBody = { title, type };
    const collectionId = optionalUuid(fields.collectionId, "Collection ID", action);
    const externalLink = optionalUrl(fields.externalLink, "External Link", action);
    const externalId = optionalText(fields.externalId);
    const category = optionalText(fields.category);
    if (collectionId !== undefined) body.collection_id = collectionId;
    if (externalLink !== undefined) body.external_link = externalLink;
    if (externalId !== undefined) body.external_id = externalId;
    if (category !== undefined) body.category = category;
    return body;
}

export interface UpdateAssetFields {
    title: unknown;
    externalId: unknown;
    externalLink: unknown;
    category: unknown;
    siteName: unknown;
    warning: unknown;
}

export type UpdateAssetBody = Partial<Record<"title" | "external_id" | "external_link" | "category" | "site_name" | "warning", string>>;

/**
 * Builds the Update Asset PATCH body from the filled-in inputs only, so Iconik
 * leaves every other field as it is. Fails when no field is set.
 */
export function buildUpdateAssetBody(fields: UpdateAssetFields): UpdateAssetBody {
    const candidates: UpdateAssetBody = {
        title: optionalText(fields.title),
        external_id: optionalText(fields.externalId),
        external_link: optionalUrl(fields.externalLink, "External Link", UPDATE_ACTION),
        category: optionalText(fields.category),
        site_name: optionalText(fields.siteName),
        warning: optionalText(fields.warning),
    };
    const body = Object.fromEntries(Object.entries(candidates).filter(([, value]) => value !== undefined)) as UpdateAssetBody;
    if (Object.keys(body).length === 0) {
        throw new Error(
            "Could not update asset — no field to change is filled in — enter at least one of Asset Title, External ID, External Link, Asset Category, Site Name or Asset Warning"
        );
    }
    return body;
}
