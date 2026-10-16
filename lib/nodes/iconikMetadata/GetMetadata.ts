import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { IconikObjectType, SINGLE_OBJECT_TYPE_OPTIONS } from "../../enums/IconikObjectType";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { IconikApiError, toNodeError } from "../../helpers/errors";
import { callIconik, connectionFromInputs, retryOptions, setCurlOutput } from "../../helpers/execution";
import { iconikRequestConfig, sendIconikRequest } from "../../helpers/http";
import { requireObjectType, requireUuid } from "../../helpers/inputs";
import { MetadataValuesResponse, simplifyMetadata } from "../../helpers/metadata";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    OBJECT_TYPE = "Object Type",
    OBJECT_ID = "Object ID",
    VIEW_ID = "View ID",
    ICONIK_URL = "Iconik URL",
    VALUES_AS_TEXT = "Values as Text",
}

enum Output {
    OBJECT_ID = "Object ID",
    METADATA = "Metadata",
    FIELD_NAMES = "Field names",
    METADATA_VALUES = "Metadata values",
    CURL = "Curl",
}

const ACTION = "get metadata";

export default class GetMetadata extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Get Metadata",
        description: "Reads the metadata of an asset or collection in Iconik",
        category: StreamNodeSpecificationCategory.METADATA,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.OBJECT_TYPE,
                description: "Choose whether to read an asset or a collection",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: SINGLE_OBJECT_TYPE_OPTIONS,
                example: IconikObjectType.ASSETS,
                defaultValue: IconikObjectType.ASSETS,
                mandatory: false,
            },
            {
                name: Input.OBJECT_ID,
                description: "Enter the ID (UUID) of the asset or collection",
                type: StreamNodeSpecificationInputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                mandatory: true,
            },
            {
                name: Input.VIEW_ID,
                description: "Enter the ID (UUID) of the metadata view whose fields to read",
                type: StreamNodeSpecificationInputType.STRING,
                example: "0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a",
                mandatory: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
            {
                name: Input.VALUES_AS_TEXT,
                description: "Enable to have Iconik return every value as text",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.OBJECT_ID,
                description: "Returns the ID of the asset or collection that was read",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            },
            {
                name: Output.METADATA,
                description: "Returns the metadata as a simple object: field name to value, list of values, or null",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { Description: "Final cut, approved by client", Keywords: ["Summer", "Beach"], Rating: null },
            },
            {
                name: Output.FIELD_NAMES,
                description: "Returns the names of the fields Iconik returned",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["Description", "Keywords", "Rating"],
            },
            {
                name: Output.METADATA_VALUES,
                description: "Returns the full response from Iconik in its own metadata_values format",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    object_id: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                    object_type: "assets",
                    metadata_values: {
                        Description: { field_values: [{ value: "Final cut, approved by client" }] },
                        Keywords: { field_values: [{ value: "Summer" }, { value: "Beach" }] },
                        Rating: { field_values: [] },
                    },
                },
            },
            curlOutput(
                Output.CURL,
                "Returns the curl command equivalent of the request, with placeholders in place of the credentials",
                'curl -X GET -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" "https://app.iconik.io/API/metadata/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/views/0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a/?reencode_values_to_string=false"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const objectType = requireObjectType(inputs.getInputValueByInputName(Input.OBJECT_TYPE), Input.OBJECT_TYPE, ACTION);
        const objectId = requireUuid(inputs.getInputValueByInputName(Input.OBJECT_ID), Input.OBJECT_ID, ACTION);
        const viewId = requireUuid(inputs.getInputValueByInputName(Input.VIEW_ID), Input.VIEW_ID, ACTION);
        const valuesAsText = (inputs.getInputValueByInputName(Input.VALUES_AS_TEXT) as boolean | undefined) ?? false;

        const config = iconikRequestConfig(connection, "GET", "metadata", [objectType, objectId, "views", viewId], {
            params: { reencode_values_to_string: valuesAsText },
        });
        setCurlOutput(this.wave, Output.CURL, config);
        const target = `${objectType} "${objectId}", view "${viewId}"`;
        let response: MetadataValuesResponse;
        try {
            response = await sendIconikRequest<MetadataValuesResponse>(config, retryOptions(this.wave));
        } catch (err: unknown) {
            // Iconik answers 404 when nothing is stored yet for this object and view; that is empty metadata, unless the view itself is missing.
            if (!(err instanceof IconikApiError && err.status === 404)) throw toNodeError(err, { action: ACTION, target }, connection);
            await callIconik(this.wave, connection, iconikRequestConfig(connection, "GET", "metadata", ["views", viewId]), {
                action: ACTION,
                target: `view "${viewId}"`,
            });
            response = { metadata_values: {} };
        }

        const metadata = simplifyMetadata(response?.metadata_values);
        this.wave.outputs.setOutput(Output.OBJECT_ID, objectId);
        this.wave.outputs.setOutput(Output.METADATA, metadata);
        this.wave.outputs.setOutput(Output.FIELD_NAMES, Object.keys(metadata));
        this.wave.outputs.setOutput(Output.METADATA_VALUES, response);
    }
}
