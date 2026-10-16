/** The Search request body. */
import { IconikObjectType, OBJECT_TYPE_OR_BOTH_VALUES } from "../enums/IconikObjectType";
import { optionalText, parseJsonInput, requireOption } from "./inputs";

export interface SearchBody {
    doc_types: string[];
    query?: string;
    filter?: Record<string, unknown>;
    sort?: unknown[];
}

const ACTION = "search Iconik";

/** Builds the search body; with neither a query nor a filter, Iconik returns every object of the chosen types. */
export function buildSearchBody(fields: { query: unknown; objectTypes: unknown; filter: unknown; sort: unknown }): SearchBody {
    const objectTypes = requireOption(
        fields.objectTypes,
        OBJECT_TYPE_OR_BOTH_VALUES,
        IconikObjectType.ASSETS,
        "Object Types",
        ACTION,
        "Assets, Collections or both"
    );
    const body: SearchBody = { doc_types: objectTypes.split(",") };
    const query = optionalText(fields.query);
    if (query !== undefined) body.query = query;

    const filter = parseJsonInput(fields.filter, "Search Filter", ACTION);
    if (filter !== undefined) {
        if (typeof filter !== "object" || filter === null || Array.isArray(filter)) {
            throw new Error(
                'Could not search Iconik — Search Filter is not a JSON object — enter an object such as {"operator": "AND", "terms": [...]}'
            );
        }
        body.filter = filter as Record<string, unknown>;
    }
    const sort = parseJsonInput(fields.sort, "Sort Order", ACTION);
    if (sort !== undefined) {
        if (!Array.isArray(sort)) {
            throw new Error(
                'Could not search Iconik — Sort Order is not a JSON array — enter a list such as [{"name": "date_created", "order": "desc"}]'
            );
        }
        body.sort = sort;
    }
    return body;
}
