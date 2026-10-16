import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { IconikObjectType, OBJECT_TYPE_OR_BOTH_OPTIONS } from "../../enums/IconikObjectType";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { connectionFromInputs, runListRequest, setCurlOutput } from "../../helpers/execution";
import { iconikRequestConfig } from "../../helpers/http";
import { requireWholeNumber } from "../../helpers/inputs";
import { buildSearchBody } from "../../helpers/search";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    SEARCH_QUERY = "Search Query",
    OBJECT_TYPES = "Object Types",
    SEARCH_FILTER = "Search Filter",
    SORT_ORDER = "Sort Order",
    RESULTS_PER_PAGE = "Results per Page",
    PAGE = "Page",
    FETCH_ALL = "Fetch All",
    ICONIK_URL = "Iconik URL",
    GENERATE_SIGNED_URLS = "Generate Signed URLs",
}

enum Output {
    OBJECT_IDS = "Object IDs",
    TOTAL_COUNT = "Total count",
    PAGE = "Page",
    PAGES = "Pages",
    WARNING = "Warning",
    OBJECTS = "Objects",
    SEARCH_RESULT = "Search result",
    CURL = "Curl",
}

const ACTION = "search Iconik";

export default class Search extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Search",
        description: "Searches assets and collections in Iconik",
        category: StreamNodeSpecificationCategory.SEARCH,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.SEARCH_QUERY,
                description: "Enter the text to search for; leave it and Search Filter empty to list all objects",
                type: StreamNodeSpecificationInputType.STRING,
                example: "summer campaign",
                mandatory: false,
            },
            {
                name: Input.OBJECT_TYPES,
                description: "Choose what to search: assets, collections, or both",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: OBJECT_TYPE_OR_BOTH_OPTIONS,
                example: IconikObjectType.ASSETS,
                defaultValue: IconikObjectType.ASSETS,
                mandatory: false,
            },
            {
                name: Input.SEARCH_FILTER,
                description: "Enter an Iconik search filter as a JSON object; optional, combines with Search Query",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: `{
  "operator": "AND",
  "terms": [
    { "name": "status", "value": "ACTIVE" },
    { "name": "date_created", "range": { "min": "2026-01-01T00:00:00Z" } }
  ]
}`,
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.SORT_ORDER,
                description: "Enter the sort order as a JSON array of field names and directions",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: `[
  { "name": "date_created", "order": "desc" }
]`,
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.RESULTS_PER_PAGE,
                description: "Enter how many results to return per page, from 1 to 500",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 50,
                defaultValue: 50,
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.PAGE,
                description: "Enter the number of the page to return, starting at 1",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 1,
                defaultValue: 1,
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.FETCH_ALL,
                description: "Enable to return all results across pages, up to 10,000",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
            {
                name: Input.GENERATE_SIGNED_URLS,
                description: "Enable to have Iconik include signed URLs, such as keyframe links, in the results",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: true,
                defaultValue: true,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.OBJECT_IDS,
                description: "Returns the IDs of the objects found",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"],
            },
            {
                name: Output.TOTAL_COUNT,
                description: "Returns how many objects match the search in Iconik",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1,
            },
            {
                name: Output.PAGE,
                description: "Returns the number of the last page returned",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1,
            },
            {
                name: Output.PAGES,
                description: "Returns how many pages the search has in Iconik",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1,
            },
            {
                name: Output.WARNING,
                description: "Returns a warning when Fetch All stopped at 10,000 objects",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Fetch All stopped at 10000 objects; Iconik reports 12500 matches. Narrow the search to get the rest.",
            },
            {
                name: Output.OBJECTS,
                description: "Returns the objects found, as Iconik returns them",
                type: StreamNodeSpecificationOutputType.JSON,
                example: [{ id: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b", title: "Summer_Campaign_Final.mov", object_type: "assets" }],
            },
            {
                name: Output.SEARCH_RESULT,
                description: "Returns Iconik's full response for the last page fetched",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    objects: [{ id: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b", title: "Summer_Campaign_Final.mov", object_type: "assets" }],
                    page: 1,
                    pages: 1,
                    per_page: 50,
                    total: 1,
                },
            },
            curlOutput(
                Output.CURL,
                "Returns the curl command for the first request, with placeholders in place of the credentials",
                'curl -X POST -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" -d \'{"doc_types":["assets"],"query":"summer campaign"}\' "https://app.iconik.io/API/search/v1/search/?page=1&per_page=50&generate_signed_url=true"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const body = buildSearchBody({
            query: inputs.getInputValueByInputName(Input.SEARCH_QUERY),
            objectTypes: inputs.getInputValueByInputName(Input.OBJECT_TYPES),
            filter: inputs.getInputValueByInputName(Input.SEARCH_FILTER),
            sort: inputs.getInputValueByInputName(Input.SORT_ORDER),
        });
        const perPage = requireWholeNumber(
            inputs.getInputValueByInputName(Input.RESULTS_PER_PAGE),
            Input.RESULTS_PER_PAGE,
            ACTION,
            1,
            500,
            50
        );
        const fetchAll = (inputs.getInputValueByInputName(Input.FETCH_ALL) as boolean | undefined) ?? false;
        const page = fetchAll ? 1 : requireWholeNumber(inputs.getInputValueByInputName(Input.PAGE), Input.PAGE, ACTION, 1, undefined, 1);
        const signedUrls = (inputs.getInputValueByInputName(Input.GENERATE_SIGNED_URLS) as boolean | undefined) ?? true;

        const config = iconikRequestConfig(connection, "POST", "search", ["search"], {
            params: { page, per_page: perPage, generate_signed_url: signedUrls },
            data: body,
        });
        setCurlOutput(this.wave, Output.CURL, config);
        await runListRequest(
            this.wave,
            connection,
            config,
            { page, perPage, fetchAll },
            {
                action: ACTION,
                target: (failedPage) => `page ${failedPage}`,
                warningNoun: "matches",
                warningHint: "Narrow the search to get the rest.",
            },
            {
                objectIds: Output.OBJECT_IDS,
                totalCount: Output.TOTAL_COUNT,
                page: Output.PAGE,
                pages: Output.PAGES,
                warning: Output.WARNING,
                objects: Output.OBJECTS,
                raw: Output.SEARCH_RESULT,
            }
        );
    }
}
