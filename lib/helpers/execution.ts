/**
 * The steps every Iconik node's execute() repeats: reading the connection,
 * writing the redacted Curl output, sending a request with retries and the
 * shared error mapping, and setting the outputs of a list. Plain functions on
 * purpose: the engine re-links each node class directly to its own Node at load
 * time, so a shared base class between them would be skipped at runtime.
 */
import { AxiosRequestConfig } from "axios";
import Wave from "wave-engine/helpers/Wave";
import { ErrorContext, IconikApiError, toNodeError } from "./errors";
import {
    FETCH_ALL_CAP,
    IconikConnection,
    ListResult,
    RetryOptions,
    fetchAllWarning,
    fetchList,
    objectIds,
    readConnection,
    redactRequest,
    sendIconikRequest,
} from "./http";

/** Reads App ID, Auth Token and Iconik URL by the node's own input names. */
export function connectionFromInputs(wave: Wave, appIdName: string, authTokenName: string, iconikUrlName: string): IconikConnection {
    return readConnection(
        wave.inputs.getInputValueByInputName(appIdName),
        wave.inputs.getInputValueByInputName(authTokenName),
        wave.inputs.getInputValueByInputName(iconikUrlName)
    );
}

/** Retry options that stop waiting when the stream is canceled. */
export function retryOptions(wave: Wave): RetryOptions {
    return { isCanceled: () => wave.general.isCanceled() };
}

/** Sets the Curl output to the redacted request; several requests are separated by a blank line. */
export function setCurlOutput(wave: Wave, outputName: string, configs: AxiosRequestConfig | AxiosRequestConfig[]): void {
    const list = Array.isArray(configs) ? configs : [configs];
    wave.outputs.setOutput(outputName, list.map((config) => wave.axiosHelper.convertRequestToCurl(redactRequest(config))).join("\n\n"));
}

export interface CallOptions {
    /** When set, the Curl output is set to this request before it is sent. */
    curlOutput?: string;
    /** When set, a 404 fails with this error instead of the shared message. */
    onNotFound?: () => Error | Promise<Error>;
}

/** Sends one request with retries; any failure becomes the node's error message, with the credentials removed. */
export async function callIconik<T>(
    wave: Wave,
    connection: IconikConnection,
    config: AxiosRequestConfig,
    context: ErrorContext,
    options: CallOptions = {}
): Promise<T> {
    if (options.curlOutput) setCurlOutput(wave, options.curlOutput, config);
    try {
        return await sendIconikRequest<T>(config, retryOptions(wave));
    } catch (err: unknown) {
        if (options.onNotFound && err instanceof IconikApiError && err.status === 404) throw await options.onNotFound();
        throw toNodeError(err, context, connection);
    }
}

/** The output names a list node uses; each node keeps its own Output enum. */
export interface ListOutputNames {
    objectIds: string;
    totalCount: string;
    page: string;
    pages: string;
    warning: string;
    objects: string;
    raw: string;
}

/**
 * Runs a list or search request as the Page / Results per Page / Fetch All
 * inputs describe and sets the list outputs. A failing page is named in the
 * error, also during Fetch All.
 */
export async function runListRequest(
    wave: Wave,
    connection: IconikConnection,
    config: AxiosRequestConfig,
    paging: { page: number; perPage: number; fetchAll: boolean },
    context: { action: string; target: (page: number) => string; warningNoun: string; warningHint: string },
    outputs: ListOutputNames
): Promise<ListResult<{ id?: string }>> {
    let result: ListResult<{ id?: string }>;
    try {
        result = await fetchList<{ id?: string }>(config, { ...paging, cap: FETCH_ALL_CAP }, retryOptions(wave));
    } catch (err: unknown) {
        const failedPage = err instanceof IconikApiError && err.page !== undefined ? err.page : paging.page;
        throw toNodeError(err, { action: context.action, target: context.target(failedPage) }, connection);
    }
    wave.outputs.setOutput(outputs.objectIds, objectIds(result.objects));
    wave.outputs.setOutput(outputs.totalCount, result.total);
    wave.outputs.setOutput(outputs.page, result.page);
    wave.outputs.setOutput(outputs.pages, result.pages);
    wave.outputs.setOutput(
        outputs.warning,
        result.truncated ? fetchAllWarning(result.total, context.warningNoun, context.warningHint) : ""
    );
    wave.outputs.setOutput(outputs.objects, result.objects);
    wave.outputs.setOutput(outputs.raw, result.response);
    return result;
}
