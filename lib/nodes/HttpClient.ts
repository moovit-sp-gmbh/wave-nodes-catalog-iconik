import Node from "../Node";
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { HttpMethod } from "hcloud-sdk/lib/interfaces/global/HttpMethod";
import {
    StreamNodeSpecificationDependendInput,
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationV4,
} from "hcloud-sdk/lib/interfaces/high5";
import { Query } from "hcloud-sdk/lib/interfaces/high5/wave/dependentInputs";
import https from "https";

export enum Input {
    URL = "URL",
    METHOD = "Method",
    HEADERS = "Headers",
    BODY = "Body",
    QUERY_PARAMETERS = "Query Parameters",
    FAIL_ON_NON_2XX_RESPONSE = "Fail on non-2XX Response",
    FOLLOW_REDIRECTS = "Follow Redirects",
    IGNORE_INVALID_SSL_CERTIFICATE = "Ignore invalid SSL Certificate",
    TIMEOUT = "Timeout",
}

enum Output {
    STATUS_CODE = "Status code",
    HEADERS = "Headers",
    BODY = "Body",
    CURL = "Curl",
}

export default class HttpClientAction extends Node {
    specification: StreamNodeSpecificationV4 = {
        specVersion: 4,
        deprecated: false,
        name: "HTTP Client",
        description: "HTTP client for sending HTTP requests",
        category: "Communication",
        version: {
            major: 1,
            minor: 0,
            patch: 0,
            changelog: [
            ],
        },
        author: {
            name: "",
            company: "",
            email: "",
        },
        inputs: [
            {
                name: Input.URL,
                description: "Enter the URL of the HTTP service",
                type: StreamNodeSpecificationInputType.STRING,
                example: "https://app.helmut.cloud/api/",
                mandatory: true,
            },
            {
                name: Input.METHOD,
                description: "Choose the HTTP method to send the request",
                type: StreamNodeSpecificationInputType.STRING_SELECT,
                options: Object.fromEntries(Object.values(HttpMethod).map((v) => [v, v])),
                example: HttpMethod.GET,
                defaultValue: HttpMethod.POST,
                mandatory: true,
            },
            {
                name: Input.HEADERS,
                description: "Enter HTTP headers to be included with the request",
                type: StreamNodeSpecificationInputType.STRING_MAP,
                example: { Authorization: "Bearer your_bearer_token" },
            },
            {
                name: Input.BODY,
                description: "Enter the HTTP request body content",
                type: StreamNodeSpecificationInputType.STRING_LONG,
                example: '{ "userId": 123, "userName": "HelmutCloud", "email": "hellofrom@helmut.cloud" }',
                if: {
                    method: {
                        $in: [
                            HttpMethod.POST,
                            HttpMethod.PUT,
                            HttpMethod.PATCH,
                            HttpMethod.DELETE
                        ]
                    }
                } as Query<{ method: HttpMethod }>,
            } as StreamNodeSpecificationDependendInput,
            {
                name: Input.QUERY_PARAMETERS,
                description: "Enter query parameters to be included with the request",
                type: StreamNodeSpecificationInputType.STRING_MAP,
                example: { userId: "123" },
                advanced: true,
            },
            {
                name: Input.FAIL_ON_NON_2XX_RESPONSE,
                description:
                    "Enable this option to trigger the fail output connector if the HTTP response code falls outside the 2xx range",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
            {
                name: Input.FOLLOW_REDIRECTS,
                description:
                    "Enable this option if the node should follow HTTP redirect requests. If disabled and a redirect request is sent, the node will fail",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: true,
                advanced: true,
            },
            {
                name: Input.IGNORE_INVALID_SSL_CERTIFICATE,
                description:
                    "Enable to allow HTTP requests even if the server's SSL certificate is invalid. If disabled, invalid certificates cause the node to fail",
                type: StreamNodeSpecificationInputType.BOOLEAN,
                example: false,
                defaultValue: false,
                advanced: true,
            },
            {
                name: Input.TIMEOUT,
                description:
                    "Enter the number of seconds the HTTP node should wait for a response before it times out and fails (default is 60s)",
                type: StreamNodeSpecificationInputType.NUMBER,
                example: 10,
                defaultValue: 60,
                advanced: true,
            },
        ],
        outputs: [
            {
                name: Output.STATUS_CODE,
                description:
                    "Returns the HTTP status code from the application server. Status codes include: 2xx: Successful responses(e.g., 200 OK, 201 Created, 204 No Content). 3xx: Redirection messages(e.g., 301 Moved Permanently). 4xx: Client error responses(e.g., 400 Bad Request, 401 Unauthorized, 403 Forbidden, 404 Not Found). 5xx: Server error responses(e.g., 500 Internal Server Error, 503 Service Unavailable) ",
                type: StreamNodeSpecificationOutputType.NUMBER,
                example: 200,
            },
            {
                name: Output.HEADERS,
                description: "Returns the HTTP response headers from the application server",
                type: StreamNodeSpecificationOutputType.STRING_MAP,
                example: {
                    "Content-Type": "application/json",
                    "Content-Length": "123",
                    Server: "Apache/2.4.1",
                    "Set-Cookie": "sessionId=abc123; Path=/; HttpOnly",
                    Date: "Wed, 21 Oct 2023 07:28:00 GMT",
                    Connection: "keep-alive",
                },
            },
            {
                name: Output.BODY,
                description:
                    "Returns the response body from the application server. The output may be empty in scenarios like successful requests without content (204), HEAD requests, redirections, unmodified resources (304), client/server errors, or specific API designs.",
                type: StreamNodeSpecificationOutputType.STRING,
                example: '{ "userId": 123, "userName": "HelmutCloud", "email": "hellofrom@helmut.cloud" }',
            },
            {
                name: Output.CURL,
                description: "Returns the cURL command with the data from the node",
                type: StreamNodeSpecificationOutputType.STRING,
                example: {
                    name: "Curl",
                    value: `curl -X POST \
      -H "Authorization: Bearer your-api-key-here" \
      -H "Content-Type: application/json" \
      -d '{ "name": "helmut.cloud", "start": "2023-04-15T10:00:00", "end": "2023-04-15T16:00:00" }' \
      https://api.example.com/`,
                },
            },
        ],
    };

    async execute(): Promise<void> {
        const url = this.wave.inputs.getInputValueByInputName(Input.URL) as string;
        const method = this.wave.inputs.getInputValueByInputName(Input.METHOD) as string;
        const headers = this.wave.inputs.getInputValueByInputName(Input.HEADERS) as Record<string, string | string[]> | undefined;
        const data = this.wave.inputs.getInputValueByInputName(Input.BODY) as string | undefined;
        const queryParameters = this.wave.inputs.getInputValueByInputName(Input.QUERY_PARAMETERS) as Record<string, string> | undefined;
        const timeout = this.wave.inputs.getInputValueByInputName(Input.TIMEOUT) as number;
        const ignoreSSLCert = this.wave.inputs.getInputValueByInputName(Input.IGNORE_INVALID_SSL_CERTIFICATE) as boolean;
        const failOnNon2XXResponse = this.wave.inputs.getInputValueByInputName(Input.FAIL_ON_NON_2XX_RESPONSE) as boolean;
        const followRedirects = this.wave.inputs.getInputValueByInputName(Input.FOLLOW_REDIRECTS) as boolean;

        const requestConfig: AxiosRequestConfig = {
            method: method,
            url: url.trim(),
            headers: headers,
            data: data,
            params: queryParameters,
            timeout: timeout * 1000,
            transformResponse: (res) => res,
        };

        if (requestConfig.data === "") {
            requestConfig.data = undefined;
        }

        if (ignoreSSLCert) {
            const agent = new https.Agent({ rejectUnauthorized: false });
            requestConfig.httpsAgent = agent;
        }

        if (failOnNon2XXResponse) {
            requestConfig.validateStatus = (status) => status >= 200 && status < 300;
        } else {
            requestConfig.validateStatus = () => true;
        }

        if (!followRedirects) {
            const oldValidateStatus = requestConfig.validateStatus;
            requestConfig.validateStatus = (s) => {
                if (s >= 300 && s < 400) {
                    return false;
                }
                return oldValidateStatus(s);
            };
            requestConfig.maxRedirects = 0;
        }

        this.wave.outputs.setOutput(Output.CURL, this.wave.axiosHelper.convertRequestToCurl(requestConfig));

        try {
            const res = await axios.request(requestConfig);

            const [body, type] = this.parseBody(res);

            this.wave.outputs.setOutput(Output.STATUS_CODE, res.status);
            this.wave.outputs.setOutput(Output.HEADERS, res.headers);
            this.wave.outputs.setOutput(Output.BODY, body, type);
        } catch (err: unknown) {
            if (axios.isAxiosError(err)) {
                this.wave.outputs.setOutput(Output.STATUS_CODE, err.response?.status);
                this.wave.outputs.setOutput(Output.HEADERS, err.response?.headers);
                this.wave.outputs.setOutput(Output.BODY, err.response?.data);
                throw new Error(err.name + ": " + err.message);
            } else {
                throw err;
            }
        }
    }

    parseBody(response: AxiosResponse): [string | object, StreamNodeSpecificationOutputType] {
        const contentType = response.headers["content-type"];
        if (!contentType) {
            return [response.data, StreamNodeSpecificationOutputType.ANY];
        }

        if (contentType.includes("application/json")) {
            try {
                return [JSON.parse(response.data), StreamNodeSpecificationOutputType.JSON];
            } catch {
                return [response.data, StreamNodeSpecificationOutputType.ANY];
            }
        }

        if (contentType.includes("application/xml") || contentType.includes("text/xml")) {
            return [response.data, StreamNodeSpecificationOutputType.XML];
        }

        if (contentType.includes("application/html") || contentType.includes("text/html")) {
            return [response.data, StreamNodeSpecificationOutputType.HTML];
        }

        return [response.data, StreamNodeSpecificationOutputType.ANY];
    }
}
