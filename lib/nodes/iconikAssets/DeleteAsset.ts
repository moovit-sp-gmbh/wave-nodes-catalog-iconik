import Node from "../../Node";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { callIconik, connectionFromInputs, setCurlOutput } from "../../helpers/execution";
import { iconikRequestConfig } from "../../helpers/http";
import { chunk, parseIdList } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    ASSET_IDS = "Asset IDs",
    ICONIK_URL = "Iconik URL",
}

enum Output {
    DELETED_IDS = "Deleted IDs",
    DELETED_COUNT = "Deleted count",
    CURL = "Curl",
}

/** Iconik is sent at most this many IDs per request; longer lists are split. */
const BATCH_SIZE = 100;
const ACTION = "delete assets";

export default class DeleteAsset extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Delete Asset",
        description: "Moves assets to the delete queue in Iconik, where they can still be restored",
        category: StreamNodeSpecificationCategory.ASSETS,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.ASSET_IDS,
                description: "Enter the IDs (UUIDs) of the assets to delete",
                type: StreamNodeSpecificationInputType.STRING_LIST,
                example: ["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"],
                mandatory: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
        ],
        outputs: [
            {
                name: Output.DELETED_IDS,
                description: "Returns the IDs of the assets sent to the delete queue",
                type: StreamNodeSpecificationOutputType.STRING_LIST,
                example: ["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"],
            },
            {
                name: Output.DELETED_COUNT,
                description: "Returns how many assets were sent to the delete queue",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1,
            },
            curlOutput(
                Output.CURL,
                "Returns one curl command per request sent, with placeholders in place of the credentials",
                'curl -X POST -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" -d \'{"ids":["7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b"]}\' "https://app.iconik.io/API/assets/v1/delete_queue/assets/"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const assetIds = parseIdList(this.wave.inputs.getInputValueByInputName(Input.ASSET_IDS), Input.ASSET_IDS, ACTION);

        const batches = chunk(assetIds, BATCH_SIZE);
        const configs = batches.map((ids) =>
            iconikRequestConfig(connection, "POST", "assets", ["delete_queue", "assets"], { data: { ids } })
        );
        setCurlOutput(this.wave, Output.CURL, configs);

        const deleted: string[] = [];
        for (const [index, config] of configs.entries()) {
            try {
                await callIconik(this.wave, connection, config, { action: ACTION });
            } catch (err: unknown) {
                const error = err as Error;
                if (deleted.length > 0) {
                    error.message += ` — ${deleted.length} of ${assetIds.length} assets were already moved to the delete queue before this error`;
                }
                throw error;
            }
            deleted.push(...batches[index]);
            this.wave.logger.updateProgress(Math.round((deleted.length / assetIds.length) * 100));
            if (deleted.length < assetIds.length && this.wave.general.isCanceled()) {
                throw new Error(
                    `Could not delete assets — the stream was canceled — ${deleted.length} of ${assetIds.length} assets were already moved to the delete queue`
                );
            }
        }

        this.wave.outputs.setOutput(Output.DELETED_IDS, deleted);
        this.wave.outputs.setOutput(Output.DELETED_COUNT, deleted.length);
    }
}
