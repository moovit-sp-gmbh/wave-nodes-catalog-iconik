import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { IconikObjectType, SINGLE_OBJECT_TYPE_OPTIONS } from "../../enums/IconikObjectType";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { callIconik, connectionFromInputs, setCurlOutput } from "../../helpers/execution";
import { iconikRequestConfig } from "../../helpers/http";
import { requireObjectType, requireOption, requireUuid } from "../../helpers/inputs";
import { METADATA_MODES, MetadataValuesResponse, buildMetadataBody, parseMetadata } from "../../helpers/metadata";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    OBJECT_TYPE = "Object Type",
    OBJECT_ID = "Object ID",
    VIEW_ID = "View ID",
    METADATA = "Metadata",
    ICONIK_URL = "Iconik URL",
    MODE = "Mode",
    IGNORE_UNCHANGED = "Ignore Unchanged",
}

enum Output {
    OBJECT_ID = "Object ID",
    METADATA = "Metadata",
    CURL = "Curl",
}

const ACTION = "set metadata";

export default class SetMetadata extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Set Metadata",
        description: "Writes metadata values to an asset or collection in Iconik",
        category: StreamNodeSpecificationCategory.METADATA,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.OBJECT_TYPE,
                description: "Choose whether to write to an asset or a collection",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: SINGLE_OBJECT_TYPE_OPTIONS,
                example: IconikObjectType.ASSETS,
                defaultValue: IconikObjectType.ASSETS,
                mandatory: false,
            },
            {
                name: Input.OBJECT_ID,
                description: "Enter the ID (UUID) of the asset or collection, e.g. from an Iconik webhook payload",
                type: StreamNodeSpecificationInputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                mandatory: true,
            },
            {
                name: Input.VIEW_ID,
                description: "Enter the ID (UUID) of the metadata view that contains the fields to write",
                type: StreamNodeSpecificationInputType.STRING,
                example: "0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a",
                mandatory: true,
            },
            {
                name: Input.METADATA,
                description:
                    "Enter the fields to write as a JSON object; keys are the case-sensitive internal field names, values are a single value or a list",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: `{
  "Description": "Final cut, approved by client",
  "Keywords": ["Summer", "Beach"]
}`,
                mandatory: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
            {
                name: Input.MODE,
                description: "Choose how the values are written to every field: replace them, add them, or remove them",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: { Overwrite: "overwrite", Append: "append", Delete: "delete" },
                example: "overwrite",
                defaultValue: "overwrite",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.IGNORE_UNCHANGED,
                description: "Enable to ask Iconik to skip values that are already set",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: true,
                defaultValue: true,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.OBJECT_ID,
                description: "Returns the ID of the asset or collection that was updated",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            },
            {
                name: Output.METADATA,
                description: "Returns all metadata values of the view after the update, as returned by Iconik",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    metadata_values: {
                        Description: { field_values: [{ value: "Final cut, approved by client" }] },
                        Keywords: { field_values: [{ value: "Summer" }, { value: "Beach" }] },
                    },
                },
            },
            curlOutput(
                Output.CURL,
                "Returns the curl command equivalent of the request, with placeholders in place of the credentials",
                'curl -X PUT -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" "https://app.iconik.io/API/metadata/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/views/0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a/?ignore_unchanged=true"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const objectType = requireObjectType(inputs.getInputValueByInputName(Input.OBJECT_TYPE), Input.OBJECT_TYPE, ACTION);
        const objectId = requireUuid(inputs.getInputValueByInputName(Input.OBJECT_ID), Input.OBJECT_ID, ACTION);
        const viewId = requireUuid(inputs.getInputValueByInputName(Input.VIEW_ID), Input.VIEW_ID, ACTION);
        const mode = requireOption(
            inputs.getInputValueByInputName(Input.MODE),
            METADATA_MODES,
            "overwrite",
            Input.MODE,
            ACTION,
            "Overwrite, Append or Delete"
        );
        const ignoreUnchanged = (inputs.getInputValueByInputName(Input.IGNORE_UNCHANGED) as boolean | undefined) ?? true;
        const body = buildMetadataBody(parseMetadata(inputs.getInputValueByInputName(Input.METADATA)), mode);

        const config = iconikRequestConfig(connection, "PUT", "metadata", [objectType, objectId, "views", viewId], {
            params: { ignore_unchanged: ignoreUnchanged },
            data: body,
        });
        setCurlOutput(this.wave, Output.CURL, config);
        const response = await callIconik<MetadataValuesResponse>(this.wave, connection, config, {
            action: ACTION,
            target: `${objectType} "${objectId}", view "${viewId}"`,
        });

        this.wave.outputs.setOutput(Output.OBJECT_ID, objectId);
        this.wave.outputs.setOutput(Output.METADATA, response);
    }
}
