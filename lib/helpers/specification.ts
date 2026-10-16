/**
 * Specification parts that are the same in every Iconik node. Input and output
 * names still come from each node's own Input / Output enum.
 */
import {
    StreamNodeSpecificationInput,
    StreamNodeSpecificationInputType,
    StreamNodeSpecificationOutputV2,
    StreamNodeSpecificationOutputType,
    StreamNodeSpecificationAuthor,
    StreamSemanticVersion,
} from "hcloud-sdk/lib/interfaces/high5/wave";
import { DEFAULT_ICONIK_URL } from "./http";

/** The author block; a new object per call, so no two node specs share one. */
export function author(): StreamNodeSpecificationAuthor {
    return { name: "MoovIT GmbH", company: "MoovIT GmbH", email: "support@helmut.cloud" };
}

/** Version 1.0.0 of a new node; a new object per call, so bumping one node's version never changes another's. */
export function initialVersion(): StreamSemanticVersion {
    return { major: 1, minor: 0, patch: 0, changelog: ["Initial release"] };
}

/** The App ID and Auth Token inputs, both masked. */
export function credentialInputs(appIdName: string, authTokenName: string): StreamNodeSpecificationInput[] {
    return [
        {
            name: appIdName,
            description: "Enter the app ID for the Iconik API",
            type: StreamNodeSpecificationInputType.STRING_PASSWORD,
            example: "example-app-id",
            mandatory: true,
        },
        {
            name: authTokenName,
            description: "Enter the auth token for the Iconik API",
            type: StreamNodeSpecificationInputType.STRING_PASSWORD,
            example: "example-auth-token",
            mandatory: true,
        },
    ];
}

/** The advanced Iconik URL input, defaulting to the main Iconik instance. */
export function iconikUrlInput(name: string): StreamNodeSpecificationInput {
    return {
        name,
        description: "Enter the base URL of the Iconik instance",
        type: StreamNodeSpecificationInputType.STRING,
        example: DEFAULT_ICONIK_URL,
        defaultValue: DEFAULT_ICONIK_URL,
        mandatory: false,
        advanced: true,
    };
}

/** The Curl output every node ends its output list with. */
export function curlOutput(name: string, description: string, example: string): StreamNodeSpecificationOutputV2 {
    return { name, description, type: StreamNodeSpecificationOutputType.STRING, example };
}
