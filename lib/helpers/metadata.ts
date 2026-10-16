/** Conversion between the simple metadata object the nodes use and Iconik's metadata_values format. */

export type MetadataMode = "overwrite" | "append" | "delete";
export const METADATA_MODES: MetadataMode[] = ["overwrite", "append", "delete"];
type FieldValue = string | number | boolean;

export interface MetadataValuesBody {
    metadata_values: Record<string, { mode: MetadataMode; field_values: { value: FieldValue }[] }>;
}

export interface MetadataValuesResponse {
    metadata_values?: Record<string, { field_values?: unknown[] } | null>;
    [key: string]: unknown;
}

const SET_FAILED = "Could not set metadata";

function isFieldValue(value: unknown): value is FieldValue {
    return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
}

/**
 * Parses the Metadata input of Set Metadata into a plain object. Accepts the
 * JSON text typed in Stream Designer, or an object passed through a wildcard.
 */
export function parseMetadata(raw: unknown): Record<string, unknown> {
    let parsed: unknown = raw;
    if (typeof raw === "string") {
        if (raw.trim().length === 0) {
            throw new Error(`${SET_FAILED} — Metadata is empty — enter a JSON object such as {"Description": "Final cut"}`);
        }
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error(`${SET_FAILED} — Metadata is not valid JSON — enter a JSON object such as {"Description": "Final cut"}`);
        }
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error(
            `${SET_FAILED} — Metadata is not a JSON object — enter an object whose keys are field names, not an array or a single value`
        );
    }
    if (Object.keys(parsed).length === 0) {
        throw new Error(`${SET_FAILED} — Metadata contains no fields — add at least one field name and value`);
    }
    return parsed as Record<string, unknown>;
}

/** Converts one user-friendly field value into Iconik's field_values list. */
export function toFieldValues(fieldName: string, value: unknown, mode: MetadataMode): { value: FieldValue }[] {
    const values = value === null ? [] : Array.isArray(value) ? value : [value];
    for (const item of values) {
        if (!isFieldValue(item)) {
            throw new Error(
                `${SET_FAILED} — the value of field "${fieldName}" is not text, a number or true/false — use a single value or a list of such values`
            );
        }
    }
    if (values.length === 0 && mode !== "overwrite") {
        throw new Error(
            `${SET_FAILED} — field "${fieldName}" has no values, which only clears a field in Overwrite mode — add values or switch Mode to Overwrite`
        );
    }
    return (values as FieldValue[]).map((item) => ({ value: item }));
}

/** Builds the Set Metadata request body from the parsed Metadata input. */
export function buildMetadataBody(metadata: Record<string, unknown>, mode: MetadataMode): MetadataValuesBody {
    const metadataValues: MetadataValuesBody["metadata_values"] = {};
    for (const [fieldName, value] of Object.entries(metadata)) {
        metadataValues[fieldName] = { mode, field_values: toFieldValues(fieldName, value, mode) };
    }
    return { metadata_values: metadataValues };
}

/** One entry of field_values is `{ "value": x }`; anything else is kept as it is. */
function entryValue(entry: unknown): unknown {
    return entry !== null && typeof entry === "object" && "value" in entry ? (entry as { value: unknown }).value : entry;
}

/**
 * Converts Iconik's metadata_values into the plain object Get Metadata outputs:
 * one value becomes the value itself, several values an array, no value null.
 * Field names are kept exactly as Iconik returns them.
 */
export function simplifyMetadata(metadataValues: MetadataValuesResponse["metadata_values"]): Record<string, unknown> {
    const simple: Record<string, unknown> = {};
    for (const [field, entry] of Object.entries(metadataValues ?? {})) {
        const values = Array.isArray(entry?.field_values) ? entry.field_values.map(entryValue) : [];
        simple[field] = values.length === 0 ? null : values.length === 1 ? values[0] : values;
    }
    return simple;
}
