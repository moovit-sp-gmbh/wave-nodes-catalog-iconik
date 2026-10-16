import Node from "../../Node";
import { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { IconikApiError } from "../../helpers/errors";
import { callIconik, connectionFromInputs, retryOptions } from "../../helpers/execution";
import { IconikFile, IconikFormat, noOriginalMessage, pickOriginalFile } from "../../helpers/files";
import { IconikPage, iconikRequestConfig, sendIconikRequest } from "../../helpers/http";
import { requireUuid } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    ASSET_ID = "Asset ID",
    ICONIK_URL = "Iconik URL",
}

enum Output {
    DOWNLOAD_URL = "Download URL",
    FILE_ID = "File ID",
    FILE_NAME = "File name",
    FILE_SIZE = "File size",
    FORMAT_ID = "Format ID",
    FILES = "Files",
    CURL = "Curl",
}

const ACTION = "get original download URL";
/** Page size for the files listing; Iconik's own default is 10. */
const FILES_PAGE_SIZE = 100;
/** Fails a files listing longer than this many pages instead of returning part of it. */
const MAX_FILE_PAGES = 100;

export default class GetOriginalDownloadUrl extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Get Original Download URL",
        description: "Returns a temporary download URL for the original file of an asset in Iconik",
        category: StreamNodeSpecificationCategory.FILES,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.ASSET_ID,
                description: "Enter the ID (UUID) of the asset whose original file to download",
                type: StreamNodeSpecificationInputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
                mandatory: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
        ],
        outputs: [
            {
                name: Output.DOWNLOAD_URL,
                description: "Returns the temporary signed URL of the original file; use it right away in the next node",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "https://storage.example.com/originals/Summer_Campaign_Final.mov?signature=abc123&expires=1760000000",
            },
            {
                name: Output.FILE_ID,
                description: "Returns the ID of the file the URL points to",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
            },
            {
                name: Output.FILE_NAME,
                description: "Returns the name of the file",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "Summer_Campaign_Final.mov",
            },
            {
                name: Output.FILE_SIZE,
                description: "Returns the size of the file in bytes",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 1073741824,
            },
            {
                name: Output.FORMAT_ID,
                description: "Returns the ID of the asset's original format",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
            },
            {
                name: Output.FILES,
                description: "Returns all files of the original format, as Iconik returns them",
                type: StreamNodeSpecificationOutputType.JSON,
                example: [
                    {
                        id: "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e",
                        name: "Summer_Campaign_Final.mov",
                        size: 1073741824,
                        status: "CLOSED",
                        format_id: "8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d",
                    },
                ],
            },
            curlOutput(
                Output.CURL,
                "Returns the last request sent as a curl command, with placeholders in place of the credentials",
                'curl -X GET -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" "https://app.iconik.io/API/files/v1/assets/7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b/files/2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e/download_url/"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const assetId = requireUuid(this.wave.inputs.getInputValueByInputName(Input.ASSET_ID), Input.ASSET_ID, ACTION);
        const context = { action: ACTION, target: `asset "${assetId}"` };
        const call = <T>(config: AxiosRequestConfig, onNotFound?: () => Promise<Error>) =>
            callIconik<T>(this.wave, connection, config, context, { curlOutput: Output.CURL, onNotFound });
        // A 404 on the format or the files listing: either the asset does not exist, or it has no original (e.g. a placeholder).
        const noOriginalOrUnknownAsset = async (): Promise<Error> => {
            const assetConfig = iconikRequestConfig(connection, "GET", "assets", ["assets", assetId]);
            const assetExists = await sendIconikRequest(assetConfig, retryOptions(this.wave)).then(
                () => true,
                (err: unknown) => !(err instanceof IconikApiError && err.status === 404)
            );
            return new Error(
                assetExists
                    ? noOriginalMessage(assetId)
                    : `Could not get original download URL — Iconik has no asset "${assetId}" (404) — check the Asset ID`
            );
        };

        // 1. The ORIGINAL format.
        const format = await call<IconikFormat>(
            iconikRequestConfig(connection, "GET", "files", ["assets", assetId, "formats", "ORIGINAL"]),
            noOriginalOrUnknownAsset
        );
        if (!format?.id) throw new Error(noOriginalMessage(assetId));

        // 2. All files of the asset, following Iconik's last_id cursor until it reports no next page.
        const originalFiles: IconikFile[] = [];
        let lastId: string | undefined;
        for (let pageCount = 0; ; pageCount++) {
            if (pageCount === MAX_FILE_PAGES) {
                throw new Error(
                    `Could not get original download URL — asset "${assetId}" has more than ${MAX_FILE_PAGES * FILES_PAGE_SIZE} files, more than this node lists — contact the catalog maintainer`
                );
            }
            if (pageCount > 0 && this.wave.general.isCanceled()) {
                throw new Error(
                    "Could not get original download URL — the stream was canceled while listing the files — run the stream again"
                );
            }
            const params: Record<string, unknown> = { per_page: FILES_PAGE_SIZE };
            if (lastId) params.last_id = lastId;
            const page = await call<IconikPage<IconikFile>>(
                iconikRequestConfig(connection, "GET", "files", ["assets", assetId, "files"], { params }),
                noOriginalOrUnknownAsset
            );
            const batch = page.objects ?? [];
            originalFiles.push(...batch.filter((file) => file.format_id === format.id));
            lastId = batch[batch.length - 1]?.id;
            if (batch.length === 0 || !page.next_url || !lastId) break;
        }

        // 3. A signed download URL for the first complete file.
        const file = pickOriginalFile(assetId, format, originalFiles);
        if (!file.id) {
            throw new Error(
                `Could not get original download URL — Iconik returned the original file of asset "${assetId}" without an ID — check the asset's files in Iconik`
            );
        }
        const download = await call<{ url?: string }>(
            iconikRequestConfig(connection, "GET", "files", ["assets", assetId, "files", file.id, "download_url"])
        );
        if (!download?.url) {
            throw new Error(
                `Could not get original download URL — Iconik returned no URL for file "${file.id}" of asset "${assetId}" — check the file's storage in Iconik`
            );
        }

        this.wave.outputs.setOutput(Output.DOWNLOAD_URL, download.url);
        this.wave.outputs.setOutput(Output.FILE_ID, file.id);
        this.wave.outputs.setOutput(Output.FILE_NAME, file.name ?? file.original_name ?? "");
        this.wave.outputs.setOutput(Output.FILE_SIZE, typeof file.size === "number" ? file.size : 0);
        this.wave.outputs.setOutput(Output.FORMAT_ID, format.id);
        this.wave.outputs.setOutput(Output.FILES, originalFiles);
    }
}
