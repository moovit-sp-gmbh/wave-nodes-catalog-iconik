import Node from "../../Node";
import { AxiosRequestConfig } from "axios";
import {
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV3,
} from "hcloud-sdk/lib/interfaces/high5";
import { StreamNodeSpecificationCategory } from "../../enums/NodeCategory";
import { IconikAsset, buildCreateAssetBody } from "../../helpers/assets";
import { redactSecrets, toNodeError } from "../../helpers/errors";
import { callIconik, connectionFromInputs, retryOptions, setCurlOutput } from "../../helpers/execution";
import { IconikConnection, fetchAllPages, iconikRequestConfig, sendIconikRequest } from "../../helpers/http";
import { optionalText, optionalUuid } from "../../helpers/inputs";
import { author, credentialInputs, curlOutput, iconikUrlInput, initialVersion } from "../../helpers/specification";
import {
    IconikStorage,
    IconikUploadFile,
    LocalFile,
    StorageError,
    StorageMethod,
    UploadContext,
    publicFileRecord,
    buildFileBody,
    readLocalFile,
    requireStorageMethod,
    uploadToAzure,
    uploadToGcs,
    uploadToS3,
} from "../../helpers/upload";

enum Input {
    APP_ID = "App ID",
    AUTH_TOKEN = "Auth Token",
    FILE_PATH = "File Path",
    ASSET_TITLE = "Asset Title",
    COLLECTION_ID = "Collection ID",
    GENERATE_PROXIES = "Generate Proxies",
    ICONIK_URL = "Iconik URL",
    STORAGE_ID = "Storage ID",
    APPLY_DEFAULT_ACLS = "Apply Default ACLs",
}

enum Output {
    ASSET_ID = "Asset ID",
    FILE_ID = "File ID",
    FORMAT_ID = "Format ID",
    TRANSCODE_JOB_ID = "Transcode job ID",
    FILE_SIZE = "File size",
    ASSET = "Asset",
    FILE = "File",
    CURL = "Curl",
}

const ACTION = "upload file";
/** Iconik signs the S3 part URLs in pages of this size. */
const PART_URL_PAGE_SIZE = 100;

interface IconikId {
    id?: string;
    [key: string]: unknown;
}

export default class UploadFile extends Node {
    specification: StreamNodeSpecificationV3 = {
        specVersion: 3,
        deprecated: false,
        name: "Upload File",
        description: "Uploads a local file to Iconik as a new asset",
        category: StreamNodeSpecificationCategory.FILES,
        version: initialVersion(),
        author: author(),
        inputs: [
            ...credentialInputs(Input.APP_ID, Input.AUTH_TOKEN),
            {
                name: Input.FILE_PATH,
                description: "Enter the absolute path of the file to upload, on the machine the Agent runs on",
                type: StreamNodeSpecificationInputType.STRING,
                example: "/Volumes/Media/Interview_Raw_01.mov",
                mandatory: true,
            },
            {
                name: Input.ASSET_TITLE,
                description: "Enter the title of the new asset; leave it empty to use the file name",
                type: StreamNodeSpecificationInputType.STRING,
                example: "Interview Raw 01",
                mandatory: false,
            },
            {
                name: Input.COLLECTION_ID,
                description: "Enter the ID (UUID) of a collection to place the new asset in",
                type: StreamNodeSpecificationInputType.STRING,
                example: "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
                mandatory: false,
            },
            {
                name: Input.GENERATE_PROXIES,
                description: "Enable to have Iconik create the proxy and keyframes after the upload",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: true,
                defaultValue: true,
            },
            iconikUrlInput(Input.ICONIK_URL),
            {
                name: Input.STORAGE_ID,
                description: "Enter the ID (UUID) of the Iconik storage to upload to; leave it empty to use the default file storage",
                type: StreamNodeSpecificationInputType.STRING,
                example: "5c4b3a2d-1e0f-4a9b-8c7d-6e5f4a3b2c1d",
                mandatory: false,
                advanced: true,
            },
            {
                name: Input.APPLY_DEFAULT_ACLS,
                description: "Enable to give the new asset Iconik's default access rights",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: true,
                defaultValue: true,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.ASSET_ID,
                description: "Returns the ID of the new asset",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b",
            },
            {
                name: Output.FILE_ID,
                description: "Returns the ID of the uploaded file in Iconik",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
            },
            {
                name: Output.FORMAT_ID,
                description: "Returns the ID of the ORIGINAL format the file belongs to",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "8e9f0a1b-2c3d-4e5f-8a6b-7c8d9e0f1a2b",
            },
            {
                name: Output.TRANSCODE_JOB_ID,
                description: "Returns the ID of the Iconik job that creates the proxy and keyframes",
                type: StreamNodeSpecificationOutputType.STRING,
                example: "4a5b6c7d-8e9f-4a0b-9c1d-2e3f4a5b6c7d",
            },
            {
                name: Output.FILE_SIZE,
                description: "Returns the size of the uploaded file in bytes",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 524288000,
            },
            {
                name: Output.ASSET,
                description: "Returns the asset object Iconik created",
                type: StreamNodeSpecificationOutputType.JSON,
                example: { id: "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b", title: "Interview Raw 01", type: "ASSET", status: "ACTIVE" },
            },
            {
                name: Output.FILE,
                description: "Returns the file record Iconik holds for the upload",
                type: StreamNodeSpecificationOutputType.JSON,
                example: {
                    id: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
                    original_name: "Interview_Raw_01.mov",
                    size: 524288000,
                    status: "CLOSED",
                    storage_method: "GCS",
                },
            },
            curlOutput(
                Output.CURL,
                "Returns the Iconik requests as curl commands, with placeholders in place of the credentials",
                'curl -X GET -H "App-ID: <your-app-id>" -H "Auth-Token: <your-auth-token>" "https://app.iconik.io/API/files/v1/storages/matching/FILES/"'
            ),
        ],
    };

    async execute(): Promise<void> {
        const inputs = this.wave.inputs;
        const connection = connectionFromInputs(this.wave, Input.APP_ID, Input.AUTH_TOKEN, Input.ICONIK_URL);
        const file = await readLocalFile(inputs.getInputValueByInputName(Input.FILE_PATH));
        const assetBody = buildCreateAssetBody(
            {
                title: optionalText(inputs.getInputValueByInputName(Input.ASSET_TITLE)) ?? file.name,
                type: "ASSET",
                collectionId: inputs.getInputValueByInputName(Input.COLLECTION_ID),
                externalLink: undefined,
                externalId: undefined,
                category: undefined,
            },
            ACTION
        );
        const storageId = optionalUuid(inputs.getInputValueByInputName(Input.STORAGE_ID), Input.STORAGE_ID, ACTION);
        const generateProxies = (inputs.getInputValueByInputName(Input.GENERATE_PROXIES) as boolean | undefined) ?? true;
        const applyDefaultAcls = (inputs.getInputValueByInputName(Input.APPLY_DEFAULT_ACLS) as boolean | undefined) ?? true;

        // Every Iconik request goes into the Curl output as it is sent; the signed storage requests never do.
        const sent: AxiosRequestConfig[] = [];
        const track = (config: AxiosRequestConfig): void => {
            sent.push(config);
            setCurlOutput(this.wave, Output.CURL, sent);
        };
        const iconik = <T>(config: AxiosRequestConfig, action: string, target?: string): Promise<T> => {
            track(config);
            return callIconik<T>(this.wave, connection, config, { action, target });
        };

        const storage = await iconik<IconikStorage>(
            storageId
                ? iconikRequestConfig(connection, "GET", "files", ["storages", storageId])
                : iconikRequestConfig(connection, "GET", "files", ["storages", "matching", "FILES"]),
            "find the storage to upload to",
            storageId ? `storage "${storageId}"` : "no default file storage is set up in Iconik"
        );
        const method = requireStorageMethod(storage);
        const targetStorageId = storage.id ?? storageId ?? "";

        const params: Record<string, unknown> = { apply_default_acls: applyDefaultAcls };
        if (assetBody.collection_id !== undefined) params.assign_to_collection = true;
        const asset = await iconik<IconikAsset>(
            iconikRequestConfig(connection, "POST", "assets", ["assets"], { params, data: assetBody }),
            "create asset",
            assetBody.collection_id ? `collection "${assetBody.collection_id}"` : undefined
        );
        if (!asset.id) {
            throw new Error("Could not upload file — Iconik created the asset but returned no asset ID — check the asset list in Iconik");
        }
        const assetId = asset.id;

        let format: IconikId;
        let closed: IconikUploadFile;
        try {
            format = await iconik<IconikId>(
                iconikRequestConfig(connection, "POST", "files", ["assets", assetId, "formats"], {
                    data: { name: "ORIGINAL", storage_methods: [method] },
                }),
                ACTION
            );
            const fileSet = await iconik<IconikId>(
                iconikRequestConfig(connection, "POST", "files", ["assets", assetId, "file_sets"], {
                    data: { format_id: format.id, storage_id: targetStorageId, base_dir: "/", name: file.name, component_ids: [] },
                }),
                ACTION
            );
            const record = await iconik<IconikUploadFile>(
                iconikRequestConfig(connection, "POST", "files", ["assets", assetId, "files"], {
                    data: buildFileBody(file, { formatId: format.id ?? "", fileSetId: fileSet.id ?? "", storageId: targetStorageId }),
                }),
                ACTION
            );
            await this.sendToStorage(connection, file, assetId, record, method, { iconik, track });
            closed = await iconik<IconikUploadFile>(
                iconikRequestConfig(connection, "PATCH", "files", ["assets", assetId, "files", record.id ?? ""], {
                    data: { status: "CLOSED", progress_processed: 100 },
                }),
                ACTION
            );
        } catch (err: unknown) {
            throw await this.failAndRemoveAsset(err, connection, assetId, file, storage);
        }

        let jobId = "";
        if (generateProxies) {
            try {
                // 204 means the storage's transcode ignore pattern skipped the file; there is no job then.
                const job = await iconik<{ job_id?: string } | "">(
                    iconikRequestConfig(connection, "POST", "files", ["assets", assetId, "files", closed.id ?? "", "keyframes"], {
                        data: {},
                    }),
                    "start proxy generation"
                );
                jobId = (typeof job === "object" && job?.job_id) || "";
            } catch (err: unknown) {
                throw new Error(
                    `${(err as Error).message} — the file was uploaded to asset "${assetId}"; start the proxy generation in Iconik or run the stream with Generate Proxies disabled`
                );
            }
        }

        this.wave.outputs.setOutput(Output.ASSET_ID, assetId);
        this.wave.outputs.setOutput(Output.FILE_ID, closed.id ?? "");
        this.wave.outputs.setOutput(Output.FORMAT_ID, format.id ?? "");
        this.wave.outputs.setOutput(Output.TRANSCODE_JOB_ID, jobId);
        this.wave.outputs.setOutput(Output.FILE_SIZE, file.size);
        this.wave.outputs.setOutput(Output.ASSET, asset);
        this.wave.outputs.setOutput(Output.FILE, publicFileRecord(closed));
    }

    /** Sends the file's bytes to the storage's signed URL, polling for cancellation and reporting progress. */
    private async sendToStorage(
        connection: IconikConnection,
        file: LocalFile,
        assetId: string,
        record: IconikUploadFile,
        method: StorageMethod,
        requests: { iconik: <T>(config: AxiosRequestConfig, action: string) => Promise<T>; track: (config: AxiosRequestConfig) => void }
    ): Promise<void> {
        const { iconik, track } = requests;
        if (!record.upload_url) {
            throw new Error(
                `Could not upload file — Iconik returned no upload URL for the ${method} storage — check that the storage accepts uploads`
            );
        }
        const fileId = record.id ?? "";
        const controller = new AbortController();
        const cancelPoll = setInterval(() => {
            if (this.wave.general.isCanceled()) controller.abort();
        }, 1_000);
        let lastReport = 0;
        const context: UploadContext = {
            signal: controller.signal,
            isCanceled: () => this.wave.general.isCanceled(),
            onProgress: (bytes) => {
                if (Date.now() - lastReport < 1_000 && bytes < file.size) return;
                lastReport = Date.now();
                const percent = file.size === 0 ? 100 : Math.min(100, Math.floor((bytes / file.size) * 100));
                this.wave.logger.updateProgressAndMessage(percent, `Uploaded ${bytes} of ${file.size} bytes`);
            },
        };
        try {
            if (method === "GCS") await uploadToGcs(file, record, record.upload_url, context);
            else if (method === "AZURE") await uploadToAzure(file, record, record.upload_url, context);
            else
                await uploadToS3(file, record, record.upload_url, context, {
                    partUrls: async (uploadId, partCount) => {
                        const config = iconikRequestConfig(
                            connection,
                            "GET",
                            "files",
                            ["assets", assetId, "files", fileId, "multipart_url", "part"],
                            {
                                params: { upload_id: uploadId, parts_num: partCount },
                            }
                        );
                        track(config);
                        try {
                            return (
                                // Iconik's part-URL pages carry no page count, so stop once every part has a URL.
                                (
                                    await fetchAllPages<{ number?: number; url?: string }>(
                                        config,
                                        PART_URL_PAGE_SIZE,
                                        partCount,
                                        retryOptions(this.wave)
                                    )
                                ).objects
                            );
                        } catch (err: unknown) {
                            throw toNodeError(err, { action: ACTION }, connection);
                        }
                    },
                    completeUrl: async (uploadId) => {
                        const urls = await iconik<{ complete_url?: string }>(
                            iconikRequestConfig(connection, "GET", "files", ["assets", assetId, "files", fileId, "multipart_url"], {
                                params: { upload_id: uploadId },
                            }),
                            ACTION
                        );
                        if (!urls.complete_url) throw new Error("Iconik returned no URL to complete the multipart upload");
                        return urls.complete_url;
                    },
                    abort: async (uploadId) => {
                        await sendIconikRequest(
                            iconikRequestConfig(connection, "POST", "files", ["assets", assetId, "files", fileId, "multipart", "cleanup"], {
                                data: { upload_id: uploadId, abort_upload: true },
                            })
                        );
                    },
                });
        } finally {
            clearInterval(cancelPoll);
        }
    }

    /**
     * Builds the failure message for a failed upload and deletes the asset this
     * run created, so no empty asset is left behind. A failed delete is named in the message.
     */
    private async failAndRemoveAsset(
        err: unknown,
        connection: IconikConnection,
        assetId: string,
        file: LocalFile,
        storage: IconikStorage
    ): Promise<Error> {
        let message: string;
        if (this.wave.general.isCanceled()) {
            message = "Could not upload file — the stream was canceled during the upload — run the stream again";
        } else if (err instanceof StorageError) {
            message = `Could not upload file "${file.name}" — ${err.message} — check the settings of storage "${storage.name ?? storage.id}" in Iconik`;
        } else {
            // Iconik requests already fail with the shared message ("Could not …" or "Iconik authentication failed …"); keep it.
            const raw = (err as Error)?.message ?? "unknown error";
            message = /^(Could not|Iconik authentication failed)/.test(raw)
                ? raw
                : `Could not upload file "${file.name}" — ${raw} — check that the storage can be reached from the Agent's machine`;
        }
        try {
            await sendIconikRequest(
                iconikRequestConfig(connection, "POST", "assets", ["delete_queue", "assets"], { data: { ids: [assetId] } })
            );
            message += `; the new asset "${assetId}" was moved to the delete queue`;
        } catch {
            message += `; the new asset "${assetId}" could not be deleted — delete it in Iconik`;
        }
        return new Error(redactSecrets(message, connection));
    }
}
