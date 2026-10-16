import { IconikApiError, describeIconikError, extractIconikMessage, redactSecrets, toNodeError } from "../../lib/helpers/errors";

const secrets = (authToken: string, appId = "example-app-id") => ({ appId, authToken });

describe("errors", () => {
    it("extracts Iconik's error text", () => {
        expect(extractIconikMessage({ errors: ["a", "b"] })).toBe("a; b");
        expect(extractIconikMessage({ error: "bad" })).toBe("bad");
        expect(extractIconikMessage({ errors: { field1: "msg 1", field2: "msg 2" } })).toBe("field1: msg 1; field2: msg 2");
        expect(extractIconikMessage("plain")).toBe("plain");
        expect(extractIconikMessage(undefined)).toBe("no error details returned");
    });

    it("maps Iconik errors to the shared messages", () => {
        const ctx = { action: "get asset", target: 'asset "1"' };
        expect(describeIconikError(new IconikApiError(400, "bad"), ctx)).toBe("Could not get asset — Iconik returned 400: bad");
        expect(describeIconikError(new IconikApiError(403, "no"), ctx)).toBe("Iconik authentication failed — Iconik returned 403: no");
        expect(describeIconikError(new IconikApiError(404, "gone"), ctx)).toBe(
            'Could not get asset: asset "1" — Iconik returned 404: gone'
        );
        expect(describeIconikError(new IconikApiError(404, "gone"), { action: "x" })).toBe("Could not x — Iconik returned 404: gone");
        expect(describeIconikError(new IconikApiError(429, "slow"), ctx)).toBe(
            "Could not get asset after 3 attempts — Iconik returned 429: slow"
        );
    });

    it("wraps network errors and removes the token from every message", () => {
        expect(toNodeError(new Error("ENOTFOUND"), { action: "get asset" }, secrets("tok")).message).toMatch(
            /^Could not get asset — the request to Iconik failed: ENOTFOUND/
        );
        expect(
            toNodeError(new IconikApiError(401, "token s3cr3t-t0ken is bad"), { action: "get asset" }, secrets("s3cr3t-t0ken")).message
        ).toBe("Iconik authentication failed — Iconik returned 401: token <your-auth-token> is bad");
        expect(toNodeError(new Error("Could not finish the Iconik request — canceled"), { action: "x" }, secrets("tok")).message).toBe(
            "Could not finish the Iconik request — canceled"
        );
        expect(redactSecrets("token ab and app example-app-id", secrets("ab"))).toBe("token ab and app <your-app-id>");
        expect(redactSecrets("short tok stays", secrets("tok", "id"))).toBe("short tok stays");
    });
});
