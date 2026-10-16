import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { IconikAsset, buildUpdateAssetBody } from "../../helpers/assets";
import { callIconik, connectionFromInputs } from "../../helpers/execution";
import { iconikRequestConfig } from "../../helpers/http";
import { requireUuid } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    ASSET_ID = "Asset ID",
    ASSET_TITLE = "Asset Title",
    EXTERNAL_ID = "External ID",
    EXTERNAL_LINK = "External Link",
    ASSET_CATEGORY = "Asset Category",
    SITE_NAME = "Site Name",
    ASSET_WARNING = "Asset Warning",
    ICONIK_URL = "Iconik URL",
}

enum Output {
    ASSET_ID = "Asset ID",
    UPDATED_FIELDS = "Updated fields",
    ASSET = "Asset",
    CURL = "Curl",
}

const ACTION = "update asset";

export default class UpdateAsset extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Update Asset",
        description: "Changes the basic fields of an asset in Iconik",
        category: StreamNodeSpecificationCategory.ASSETS,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.ASSET_ID,
                description: "Enter the ID (UUID) of the asset to change",
                type: StreamNodeSpecificationInputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                mandatory: true,
            },
            {
                name: Input.ASSET_TITLE,
                description: "Enter the new title; leave empty to keep the current one",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Interview Final 01",
                mandatory: false,
            },
            {
                name: Input.EXTERNAL_ID,
                description: "Enter the new external reference; leave empty to keep the current one",
                type: StreamNodeSpecificationInputType.STRING,
                example: "PRJ-4711",
                mandatory: false,
            },
            {
                name: Input.EXTERNAL_LINK,
                description: "Enter the new URL the asset links to; leave empty to keep the current one",
                type: StreamNodeSpecificationInputType.STRING,
                example: "https://example.com/media/interview-final-01",
                mandatory: false,
            },
            {
                name: Input.ASSET_CATEGORY,
                description: "Enter the new category; leave empty to keep the current one",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Interviews",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.SITE_NAME,
                description: "Enter the new site name; leave empty to keep the current one",
                type: StreamNodeSpecificationInputType.STRING,
                example: "helmut",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.ASSET_WARNING,
                description: "Enter a warning text to show on the asset in Iconik; leave empty to keep the current one",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Rights expire on 2026-12-31",
                mandatory: false,
                advanced: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
        ],
        outputs: [
            {
                name: Output.ASSET_ID,
                description: "Returns the ID of the changed asset",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            },
            {
                name: Output.UPDATED_FIELDS,
                description: "Returns the Iconik names of the fields that were sent",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["title", "warning"],
            },
            {
                name: Output.ASSET,
                description: "Returns the full asset object from Iconik after the change",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    id: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                    title: "Interview Final 01",
                    status: "ACTIVE",
                    warning: "Rights expire on 2026-12-31",
                },
            },
            curlOutput(
                Output.CURL,
                "Returns the curl command equivalent of the request, with placeholders in place of the credentials",
                'curl -X PATCH -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" -d \'{"title":"Interview Final 01"}\' "https://app.iconik.io/API/assets/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const assetId = requireUuid(inputs.getInputValueByInputName(Input.ASSET_ID), Input.ASSET_ID, ACTION);
        const body = buildUpdateAssetBody({
            title: inputs.getInputValueByInputName(Input.ASSET_TITLE),
            externalId: inputs.getInputValueByInputName(Input.EXTERNAL_ID),
            externalLink: inputs.getInputValueByInputName(Input.EXTERNAL_LINK),
            category: inputs.getInputValueByInputName(Input.ASSET_CATEGORY),
            siteName: inputs.getInputValueByInputName(Input.SITE_NAME),
            warning: inputs.getInputValueByInputName(Input.ASSET_WARNING),
        });

        const context = { action: ACTION, target: `asset "${assetId}"` };

        // Iconik's asset schema lists title as required, also for PATCH; when it is not being changed, send the current one back unchanged.
        let data: Record<string, string> = body;
        if (body.title === undefined) {
            const current = await callIconik<IconikAsset>(
                this.wave,
                connection,
                iconikRequestConfig(connection, "GET", "assets", ["assets", assetId]),
                context,
                { curlOutput: Output.CURL }
            );
            if (typeof current.title === "string") data = { title: current.title, ...body };
        }

        const config = iconikRequestConfig(connection, "PATCH", "assets", ["assets", assetId], { data });
        const asset = await callIconik<IconikAsset>(this.wave, connection, config, context, { curlOutput: Output.CURL });

        this.wave.outputs.setOutput(Output.ASSET_ID, asset.id ?? assetId);
        this.wave.outputs.setOutput(Output.UPDATED_FIELDS, Object.keys(body));
        this.wave.outputs.setOutput(Output.ASSET, asset);
    }
}
