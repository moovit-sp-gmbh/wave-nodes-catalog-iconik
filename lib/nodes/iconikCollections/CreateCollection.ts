import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { IconikCollection, findExistingCollection } from "../../helpers/collections";
import { toNodeError } from "../../helpers/errors";
import { callIconik, connectionFromInputs, retryOptions, setCurlOutput } from "../../helpers/execution";
import { fetchAllPages, iconikRequestConfig } from "../../helpers/http";
import { optionalText, optionalUuid, requireOption } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    COLLECTION_TITLE = "Collection Title",
    PARENT_COLLECTION_ID = "Parent Collection ID",
    IF_EXISTS = "If Exists",
    EXTERNAL_ID = "External ID",
    COLLECTION_CATEGORY = "Collection Category",
    ICONIK_URL = "Iconik URL",
    APPLY_DEFAULT_ACLS = "Apply Default ACLs",
    APPLY_COLLECTION_ACLS = "Apply Collection ACLs",
    ACL_TEMPLATE_ID = "ACL Template ID",
}

enum Output {
    COLLECTION_ID = "Collection ID",
    COLLECTION_TITLE = "Collection title",
    PARENT_ID = "Parent ID",
    CREATED = "Created",
    COLLECTION = "Collection",
    CURL = "Curl",
}

const IF_EXISTS_OPTIONS = ["create_new", "return_existing", "fail"] as const;
/** Page size used while looking for an existing collection. */
const LOOKUP_PAGE_SIZE = 100;
/** The duplicate check looks at no more than this many collections (100 requests). */
const LOOKUP_CAP = 10_000;
const ACTION = "create collection";

export default class CreateCollection extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Create Collection",
        description: "Creates a collection in Iconik, or returns the one with the same title",
        category: StreamNodeSpecificationCategory.COLLECTIONS,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.COLLECTION_TITLE,
                description: "Enter the title of the collection",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Campaign Summer 2026",
                mandatory: true,
            },
            {
                name: Input.PARENT_COLLECTION_ID,
                description: "Enter the ID (UUID) of the collection to create it in; leave empty for root level",
                type: StreamNodeSpecificationInputType.STRING,
                example: "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
                mandatory: false,
            },
            {
                name: Input.IF_EXISTS,
                description: "Choose what happens when a collection with this title already exists in the same place",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: { "Return Existing": "return_existing", "Create New": "create_new", Fail: "fail" },
                example: "return_existing",
                defaultValue: "return_existing",
                mandatory: false,
            },
            {
                name: Input.EXTERNAL_ID,
                description: "Enter a reference to the collection in an external system",
                type: StreamNodeSpecificationInputType.STRING,
                example: "PRJ-4711",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.COLLECTION_CATEGORY,
                description: "Enter the category of the new collection",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Project",
                mandatory: false,
                advanced: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
            {
                name: Input.APPLY_DEFAULT_ACLS,
                description: "Enable to give a new collection Iconik's default access rights",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: true,
                defaultValue: true,
                advanced: true,
            },
            {
                name: Input.APPLY_COLLECTION_ACLS,
                description: "Enable to give a new collection the access rights of its parent collection",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
            {
                name: Input.ACL_TEMPLATE_ID,
                description: "Enter the ID (UUID) of an ACL template whose access rights a new collection gets",
                type: StreamNodeSpecificationInputType.STRING,
                example: "9b8a7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d",
                mandatory: false,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.COLLECTION_ID,
                description: "Returns the ID of the created or existing collection",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
            },
            {
                name: Output.COLLECTION_TITLE,
                description: "Returns the title of the collection",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Campaign Summer 2026",
            },
            {
                name: Output.PARENT_ID,
                description: "Returns the ID of the parent collection, or empty text at root level",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
            },
            {
                name: Output.CREATED,
                description: "Returns true when a new collection was created, false when an existing one was returned",
                type: StreamNodeSpecificationOutputType.BOOLEAN,
                example: true,
            },
            {
                name: Output.COLLECTION,
                description: "Returns the full collection object from Iconik",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    id: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
                    title: "Campaign Summer 2026",
                    parent_id: "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
                    status: "ACTIVE",
                    object_type: "collections",
                },
            },
            curlOutput(
                Output.CURL,
                "Returns the last request sent as a curl command, with placeholders in place of the credentials",
                'curl -X POST -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" -d \'{"title":"Campaign Summer 2026","parent_id":"3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d"}\' "https://app.iconik.io/API/assets/v1/collections/?apply_default_acls=true&apply_collection_acls=false"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const title = optionalText(inputs.getInputValueByInputName(Input.COLLECTION_TITLE));
        if (title === undefined) {
            throw new Error("Could not create collection — Collection Title is empty — enter a title for the collection");
        }
        const parentId = optionalUuid(inputs.getInputValueByInputName(Input.PARENT_COLLECTION_ID), Input.PARENT_COLLECTION_ID, ACTION);
        const ifExists = requireOption(
            inputs.getInputValueByInputName(Input.IF_EXISTS),
            IF_EXISTS_OPTIONS,
            "return_existing",
            Input.IF_EXISTS,
            ACTION,
            "Return Existing, Create New or Fail"
        );
        const aclTemplateId = optionalUuid(inputs.getInputValueByInputName(Input.ACL_TEMPLATE_ID), Input.ACL_TEMPLATE_ID, ACTION);
        const externalId = optionalText(inputs.getInputValueByInputName(Input.EXTERNAL_ID));
        const category = optionalText(inputs.getInputValueByInputName(Input.COLLECTION_CATEGORY));
        const target = parentId ? `parent collection "${parentId}"` : undefined;
        const context = { action: ACTION, target };

        // A deleted parent must not receive new collections.
        if (parentId !== undefined) {
            const parent = await callIconik<IconikCollection>(
                this.wave,
                connection,
                iconikRequestConfig(connection, "GET", "assets", ["collections", parentId]),
                context,
                { curlOutput: Output.CURL }
            );
            if (parent.status === "DELETED") {
                throw new Error(
                    `Could not create collection — the parent collection "${parentId}" is deleted — restore it in Iconik or choose another Parent Collection ID`
                );
            }
        }

        if (ifExists !== "create_new") {
            const lookup =
                parentId !== undefined
                    ? iconikRequestConfig(connection, "GET", "assets", ["collections", parentId, "contents"], {
                          params: { object_types: "collections", include_keyframes: false },
                      })
                    : iconikRequestConfig(connection, "GET", "assets", ["collections"], {
                          params: { is_root: true, include_keyframes: false },
                      });
            setCurlOutput(this.wave, Output.CURL, lookup);
            let lookupResult;
            try {
                lookupResult = await fetchAllPages<IconikCollection>(lookup, LOOKUP_PAGE_SIZE, LOOKUP_CAP, retryOptions(this.wave));
            } catch (err: unknown) {
                throw toNodeError(err, context, connection);
            }
            const existing = findExistingCollection(lookupResult.objects, title);
            if (existing === undefined && lookupResult.truncated) {
                // Creating now could duplicate a collection beyond the checked range, which Return Existing and Fail promise not to do.
                throw new Error(
                    `Could not create collection — there are more than ${LOOKUP_CAP} collections ${parentId ? `in parent collection "${parentId}"` : "at root level"} to check for '${title}' — choose a Parent Collection ID with fewer collections, or set If Exists to Create New`
                );
            }
            if (existing !== undefined) {
                if (ifExists === "fail") throw new Error(`Collection '${title}' already exists`);
                this.setResult(existing, parentId, false);
                return;
            }
        }

        const body: Record<string, unknown> = { title };
        if (parentId !== undefined) body.parent_id = parentId;
        else body.is_root = true;
        if (externalId !== undefined) body.external_id = externalId;
        if (category !== undefined) body.category = category;
        const params: Record<string, unknown> = {
            apply_default_acls: (inputs.getInputValueByInputName(Input.APPLY_DEFAULT_ACLS) as boolean | undefined) ?? true,
            apply_collection_acls: (inputs.getInputValueByInputName(Input.APPLY_COLLECTION_ACLS) as boolean | undefined) ?? false,
        };
        if (aclTemplateId !== undefined) params.apply_acl_template_id = aclTemplateId;

        const created = await callIconik<IconikCollection>(
            this.wave,
            connection,
            iconikRequestConfig(connection, "POST", "assets", ["collections"], { params, data: body }),
            context,
            { curlOutput: Output.CURL }
        );
        this.setResult(created, parentId, true, title);
    }

    private setResult(collection: IconikCollection, parentId: string | undefined, created: boolean, title?: string): void {
        this.wave.outputs.setOutput(Output.COLLECTION_ID, collection.id ?? "");
        this.wave.outputs.setOutput(Output.COLLECTION_TITLE, collection.title ?? title ?? "");
        this.wave.outputs.setOutput(Output.PARENT_ID, collection.parent_id ?? parentId ?? "");
        this.wave.outputs.setOutput(Output.CREATED, created);
        this.wave.outputs.setOutput(Output.COLLECTION, collection);
    }
}
