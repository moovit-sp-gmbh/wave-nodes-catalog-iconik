import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { IconikObjectType, SINGLE_OBJECT_TYPE_OPTIONS } from "../../enums/IconikObjectType";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { FailedObject, isAlreadyInCollection } from "../../helpers/collections";
import { IconikApiError, toNodeError } from "../../helpers/errors";
import { connectionFromInputs, retryOptions, setCurlOutput } from "../../helpers/execution";
import { iconikRequestConfig, sendIconikRequest } from "../../helpers/http";
import { parseIdList, requireObjectType, requireUuid } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    COLLECTION_ID = "Collection ID",
    OBJECT_IDS = "Object IDs",
    OBJECT_TYPE = "Object Type",
    ICONIK_URL = "Iconik URL",
}

enum Output {
    ADDED_IDS = "Added IDs",
    ADDED_COUNT = "Added count",
    FAILED = "Failed",
    FAILED_COUNT = "Failed count",
    CURL = "Curl",
}

const ACTION = "add to collection";
/** Statuses that concern the whole run, not one object: the collection or the credentials are wrong. */
const FATAL_STATUSES = new Set([401, 403, 404]);
/** Statuses an add can fail with when the object is already in the collection; only these trigger the membership check. */
const ALREADY_PRESENT_STATUSES = new Set([400, 409]);
/** How many per-object reasons the "nothing added" message lists before summarising the rest. */
const MAX_REASONS_IN_MESSAGE = 5;

export default class AddToCollection extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Add to Collection",
        description: "Adds assets or collections to a collection in Iconik",
        category: StreamNodeSpecificationCategory.COLLECTIONS,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.COLLECTION_ID,
                description: "Enter the ID (UUID) of the collection to add to",
                type: StreamNodeSpecificationInputType.STRING,
                example: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
                mandatory: true,
            },
            {
                name: Input.OBJECT_IDS,
                description: "Enter the IDs (UUIDs) of the assets or collections to add",
                type: StreamNodeSpecificationInputType.STRING_LIST,
                example: ["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"],
                mandatory: true,
            },
            {
                name: Input.OBJECT_TYPE,
                description: "Choose whether Object IDs are assets or collections",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: SINGLE_OBJECT_TYPE_OPTIONS,
                example: IconikObjectType.ASSETS,
                defaultValue: IconikObjectType.ASSETS,
                mandatory: false,
            },
            iconikUrlInput(Input.ICONIK_URL),
        ],
        outputs: [
            {
                name: Output.ADDED_IDS,
                description: "Returns the IDs that are now in the collection, including those that already were",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"],
            },
            {
                name: Output.ADDED_COUNT,
                description: "Returns how many IDs are in Added IDs",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1,
            },
            {
                name: Output.FAILED,
                description: "Returns the objects that could not be added, each with its ID and the error",
                type: StreamNodeSpecificationOutputType.JSON,
                example: [{ id: "11111111-2222-4333-8444-555555555555", error: "Iconik returned 400: Object does not exist" }],
            },
            {
                name: Output.FAILED_COUNT,
                description: "Returns how many objects could not be added",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 0,
            },
            curlOutput(
                Output.CURL,
                "Returns the curl command for the first object, with placeholders in place of the credentials",
                'curl -X POST -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" -d \'{"object_id":"7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b","object_type":"assets"}\' "https://app.iconik.io/API/assets/v1/collections/5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d/contents/"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const collectionId = requireUuid(inputs.getInputValueByInputName(Input.COLLECTION_ID), Input.COLLECTION_ID, ACTION);
        const objectIds = parseIdList(inputs.getInputValueByInputName(Input.OBJECT_IDS), Input.OBJECT_IDS, ACTION);
        const objectType = requireObjectType(inputs.getInputValueByInputName(Input.OBJECT_TYPE), Input.OBJECT_TYPE, ACTION);

        const configs = objectIds.map((id) =>
            iconikRequestConfig(connection, "POST", "assets", ["collections", collectionId, "contents"], {
                data: { object_id: id, object_type: objectType },
            })
        );
        // One example is enough: the requests for the other objects differ only in object_id.
        setCurlOutput(this.wave, Output.CURL, configs[0]);

        const retry = retryOptions(this.wave);
        const added: string[] = [];
        const failed: FailedObject[] = [];
        for (const [index, config] of configs.entries()) {
            const id = objectIds[index];
            if (this.wave.general.isCanceled()) {
                throw new Error(
                    `Could not add to collection — the stream was canceled — ${added.length} of ${objectIds.length} objects were already added`
                );
            }
            try {
                await sendIconikRequest(config, retry);
                added.push(id);
            } catch (err: unknown) {
                // No answer from Iconik, rejected credentials or a missing collection affect every object: stop at once.
                if (!(err instanceof IconikApiError) || FATAL_STATUSES.has(err.status)) {
                    const error = toNodeError(err, { action: ACTION, target: `collection "${collectionId}"` }, connection);
                    if (added.length > 0) error.message += ` — ${added.length} of ${objectIds.length} objects were already added`;
                    throw error;
                }
                if (
                    ALREADY_PRESENT_STATUSES.has(err.status) &&
                    (await isAlreadyInCollection(connection, collectionId, objectType, id, retry))
                ) {
                    added.push(id);
                } else {
                    // Keep only the reason; every entry belongs to this node, so the "Could not add to collection" prefix adds nothing.
                    const reason = toNodeError(err, { action: ACTION }, connection).message.replace(
                        /^Could not add to collection( after \d+ attempts)? — /,
                        ""
                    );
                    failed.push({ id, error: reason });
                }
            }
            this.wave.logger.updateProgress(Math.round(((index + 1) / objectIds.length) * 100));
        }

        if (added.length === 0) {
            const shown = failed.slice(0, MAX_REASONS_IN_MESSAGE).map((f) => `${f.id}: ${f.error}`);
            if (failed.length > MAX_REASONS_IN_MESSAGE) shown.push(`and ${failed.length - MAX_REASONS_IN_MESSAGE} more`);
            const reasons = shown.join("; ");
            throw new Error(
                `Could not add to collection — none of the ${objectIds.length} objects could be added to collection "${collectionId}": ${reasons}`
            );
        }
        this.wave.outputs.setOutput(Output.ADDED_IDS, added);
        this.wave.outputs.setOutput(Output.ADDED_COUNT, added.length);
        this.wave.outputs.setOutput(Output.FAILED, failed);
        this.wave.outputs.setOutput(Output.FAILED_COUNT, failed.length);
    }
}
