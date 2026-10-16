import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { IconikAsset } from "../../helpers/assets";
import { callIconik, connectionFromInputs, setCurlOutput } from "../../helpers/execution";
import { iconikRequestConfig } from "../../helpers/http";
import { requireUuid } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    ASSET_ID = "Asset ID",
    ICONIK_URL = "Iconik URL",
    INCLUDE_COLLECTIONS = "Include Collections",
    INCLUDE_USERS = "Include Users",
}

enum Output {
    ASSET_ID = "Asset ID",
    ASSET_TITLE = "Asset title",
    ASSET_STATUS = "Asset status",
    ASSET_TYPE = "Asset type",
    COLLECTION_IDS = "Collection IDs",
    ASSET = "Asset",
    CURL = "Curl",
}

const ACTION = "get asset";

export default class GetAsset extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Get Asset",
        description: "Reads an asset from Iconik",
        category: StreamNodeSpecificationCategory.ASSETS,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.ASSET_ID,
                description: "Enter the ID (UUID) of the asset, e.g. from an Iconik webhook payload",
                type: StreamNodeSpecificationInputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                mandatory: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
            {
                name: Input.INCLUDE_COLLECTIONS,
                description: "Enable to also return the IDs of the collections the asset is in",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
            {
                name: Input.INCLUDE_USERS,
                description: "Enable to also return details of the users who created, updated or deleted the asset",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.ASSET_ID,
                description: "Returns the ID of the asset",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            },
            {
                name: Output.ASSET_TITLE,
                description: "Returns the title of the asset",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Summer_Campaign_Final.mov",
            },
            {
                name: Output.ASSET_STATUS,
                description: "Returns the status of the asset: ACTIVE or DELETED",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "ACTIVE",
            },
            {
                name: Output.ASSET_TYPE,
                description: "Returns the type of the asset, e.g. ASSET or SUBCLIP",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "ASSET",
            },
            {
                name: Output.COLLECTION_IDS,
                description: "Returns the IDs of the collections the asset is in, when Include Collections is enabled",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"],
            },
            {
                name: Output.ASSET,
                description: "Returns the full asset object from Iconik",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    id: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                    title: "Summer_Campaign_Final.mov",
                    status: "ACTIVE",
                    type: "ASSET",
                    date_created: "2026-10-15T10:00:00Z",
                },
            },
            curlOutput(
                Output.CURL,
                "Returns the curl command equivalent of the request, with placeholders in place of the credentials",
                'curl -X GET -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" "https://app.iconik.io/API/assets/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/?include_collections=false&include_users=false"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const assetId = requireUuid(inputs.getInputValueByInputName(Input.ASSET_ID), Input.ASSET_ID, ACTION);
        const includeCollections = (inputs.getInputValueByInputName(Input.INCLUDE_COLLECTIONS) as boolean | undefined) ?? false;
        const includeUsers = (inputs.getInputValueByInputName(Input.INCLUDE_USERS) as boolean | undefined) ?? false;

        const config = iconikRequestConfig(connection, "GET", "assets", ["assets", assetId], {
            params: { include_collections: includeCollections, include_users: includeUsers },
        });
        setCurlOutput(this.wave, Output.CURL, config);
        const asset = await callIconik<IconikAsset>(this.wave, connection, config, { action: ACTION, target: `asset "${assetId}"` });

        // A deleted asset is still returned by Iconik; it is output like any other and Asset status shows DELETED.
        this.wave.outputs.setOutput(Output.ASSET_ID, asset.id ?? assetId);
        this.wave.outputs.setOutput(Output.ASSET_TITLE, asset.title ?? "");
        this.wave.outputs.setOutput(Output.ASSET_STATUS, asset.status ?? "");
        this.wave.outputs.setOutput(Output.ASSET_TYPE, asset.type ?? "");
        this.wave.outputs.setOutput(Output.COLLECTION_IDS, Array.isArray(asset.in_collections) ? asset.in_collections : []);
        this.wave.outputs.setOutput(Output.ASSET, asset);
    }
}
