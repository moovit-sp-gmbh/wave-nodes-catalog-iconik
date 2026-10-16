import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { ASSETS_AND_COLLECTIONS, OBJECT_TYPE_OR_BOTH_OPTIONS, OBJECT_TYPE_OR_BOTH_VALUES } from "../../enums/IconikObjectType";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { connectionFromInputs, runListRequest, setCurlOutput } from "../../helpers/execution";
import { iconikRequestConfig } from "../../helpers/http";
import { optionalText, requireOption, requireUuid, requireWholeNumber } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    COLLECTION_ID = "Collection ID",
    OBJECT_TYPES = "Object Types",
    RESULTS_PER_PAGE = "Results per Page",
    PAGE = "Page",
    FETCH_ALL = "Fetch All",
    SORT_ORDER = "Sort Order",
    ICONIK_URL = "Iconik URL",
}

enum Output {
    OBJECT_IDS = "Object IDs",
    TOTAL_COUNT = "Total count",
    PAGE = "Page",
    PAGES = "Pages",
    WARNING = "Warning",
    OBJECTS = "Objects",
    CONTENTS_RESULT = "Contents result",
    CURL = "Curl",
}

const ACTION = "list collection contents";

export default class ListCollectionContents extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "List Collection Contents",
        description: "Lists the assets and collections in an Iconik collection",
        category: StreamNodeSpecificationCategory.COLLECTIONS,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.COLLECTION_ID,
                description: "Enter the ID (UUID) of the collection to list",
                type: StreamNodeSpecificationInputType.STRING,
                example: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
                mandatory: true,
            },
            {
                name: Input.OBJECT_TYPES,
                description: "Choose what to list: assets, collections, or both",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: OBJECT_TYPE_OR_BOTH_OPTIONS,
                example: ASSETS_AND_COLLECTIONS,
                defaultValue: ASSETS_AND_COLLECTIONS,
                mandatory: false,
            },
            {
                name: Input.RESULTS_PER_PAGE,
                description: "Enter how many objects to return per page, from 1 to 500",
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
                description: "Enable to return the objects of all pages, up to 10,000",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
            {
                name: Input.SORT_ORDER,
                description: "Enter the sort order as field names with asc or desc, e.g. date_created,desc",
                type: StreamNodeSpecificationInputType.STRING,
                example: "date_created,desc",
                mandatory: false,
                advanced: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
        ],
        outputs: [
            {
                name: Output.OBJECT_IDS,
                description: "Returns the IDs of the objects listed",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"],
            },
            {
                name: Output.TOTAL_COUNT,
                description: "Returns how many objects of the chosen types the collection holds",
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
                description: "Returns how many pages the listing has",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1,
            },
            {
                name: Output.WARNING,
                description: "Returns a warning when Fetch All stopped at 10,000 objects",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Fetch All stopped at 10000 objects; Iconik reports 12500 objects. Use Page to get the rest.",
            },
            {
                name: Output.OBJECTS,
                description: "Returns the objects listed, as Iconik returns them",
                type: StreamNodeSpecificationOutputType.JSON,
                example: [{ id: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b", title: "Summer_Campaign_Final.mov", object_type: "assets" }],
            },
            {
                name: Output.CONTENTS_RESULT,
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
                'curl -X GET -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" "https://app.iconik.io/API/assets/v1/collections/5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d/contents/?object_types=assets%2Ccollections&page=1&per_page=50"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const collectionId = requireUuid(inputs.getInputValueByInputName(Input.COLLECTION_ID), Input.COLLECTION_ID, ACTION);
        const objectTypes = requireOption(
            inputs.getInputValueByInputName(Input.OBJECT_TYPES),
            OBJECT_TYPE_OR_BOTH_VALUES,
            ASSETS_AND_COLLECTIONS,
            Input.OBJECT_TYPES,
            ACTION,
            "Assets, Collections or both"
        );
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
        const sort = optionalText(inputs.getInputValueByInputName(Input.SORT_ORDER));

        const params: Record<string, unknown> = { object_types: objectTypes, page, per_page: perPage };
        if (sort !== undefined) params.sort = sort;
        const config = iconikRequestConfig(connection, "GET", "assets", ["collections", collectionId, "contents"], { params });
        setCurlOutput(this.wave, Output.CURL, config);
        await runListRequest(
            this.wave,
            connection,
            config,
            { page, perPage, fetchAll },
            {
                action: ACTION,
                target: () => `collection "${collectionId}"`,
                warningNoun: "objects",
                warningHint: "Use Page to get the rest.",
            },
            {
                objectIds: Output.OBJECT_IDS,
                totalCount: Output.TOTAL_COUNT,
                page: Output.PAGE,
                pages: Output.PAGES,
                warning: Output.WARNING,
                objects: Output.OBJECTS,
                raw: Output.CONTENTS_RESULT,
            }
        );
    }
}
