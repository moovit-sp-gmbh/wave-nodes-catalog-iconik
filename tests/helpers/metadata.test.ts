import { buildIconikUrl } from "../../lib/helpers/http";
import { buildMetadataBody, parseMetadata, simplifyMetadata, toFieldValues } from "../../lib/helpers/metadata";

const OBJECT_ID = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const VIEW_ID = "0d9e8f7a-6b5c-4d3e-2f1a-0b9c8d7e6f5a";

describe("parseMetadata", () => {
    it("parses JSON text and accepts an object passed through a wildcard", () => {
        expect(parseMetadata('{"Description": "x"}')).toEqual({ Description: "x" });
        expect(parseMetadata({ Description: "x" })).toEqual({ Description: "x" });
    });

    it.each([
        ["", /Metadata is empty/],
        ["{not json", /not valid JSON/],
        ["[1, 2]", /not a JSON object/],
        ['"text"', /not a JSON object/],
        ["{}", /contains no fields/],
    ])("rejects %p", (raw, message) => {
        expect(() => parseMetadata(raw)).toThrow(message);
    });
});

describe("value conversion", () => {
    it("wraps a single value and maps a list", () => {
        expect(toFieldValues("Description", "x", "overwrite")).toEqual([{ value: "x" }]);
        expect(toFieldValues("Keywords", ["a", "b"], "append")).toEqual([{ value: "a" }, { value: "b" }]);
    });

    it("passes numbers and booleans unchanged", () => {
        expect(toFieldValues("Rating", 4, "overwrite")).toEqual([{ value: 4 }]);
        expect(toFieldValues("Approved", false, "overwrite")).toEqual([{ value: false }]);
    });

    it("clears a field with [] or null in overwrite mode", () => {
        expect(toFieldValues("Keywords", [], "overwrite")).toEqual([]);
        expect(toFieldValues("Keywords", null, "overwrite")).toEqual([]);
    });

    it("rejects an empty value in append or delete mode", () => {
        expect(() => toFieldValues("Keywords", [], "append")).toThrow(/only clears a field in Overwrite mode/);
        expect(() => toFieldValues("Keywords", null, "delete")).toThrow(/only clears a field in Overwrite mode/);
    });

    it("rejects nested objects", () => {
        expect(() => toFieldValues("Info", { a: 1 }, "overwrite")).toThrow(/field "Info" is not text/);
        expect(() => toFieldValues("Info", [["a"]], "overwrite")).toThrow(/field "Info" is not text/);
    });

    it("applies the mode to every field", () => {
        expect(buildMetadataBody({ Description: "x", Keywords: ["a"] }, "delete")).toEqual({
            metadata_values: {
                Description: { mode: "delete", field_values: [{ value: "x" }] },
                Keywords: { mode: "delete", field_values: [{ value: "a" }] },
            },
        });
    });

    it("builds the URL with a trailing slash", () => {
        expect(buildIconikUrl("https://eu.iconik.io", "metadata", ["collections", OBJECT_ID, "views", VIEW_ID])).toBe(
            `https://eu.iconik.io/API/metadata/v1/collections/${OBJECT_ID}/views/${VIEW_ID}/`
        );
    });
});

describe("simplifyMetadata", () => {
    it("turns one value into the value, several into a list and none into null", () => {
        expect(
            simplifyMetadata({
                Description: { field_values: [{ value: "Final cut" }] },
                Keywords: { field_values: [{ value: "Summer" }, { value: "Beach" }] },
                Rating: { field_values: [] },
                Missing: {},
                Nulled: null,
                Count: { field_values: [{ value: 4 }] },
                Approved: { field_values: [{ value: false }] },
            })
        ).toEqual({
            Description: "Final cut",
            Keywords: ["Summer", "Beach"],
            Rating: null,
            Missing: null,
            Nulled: null,
            Count: 4,
            Approved: false,
        });
    });

    it("keeps case-sensitive field names and entries without a value key", () => {
        expect(simplifyMetadata({ description: { field_values: [{ label: "x" }] } })).toEqual({ description: { label: "x" } });
        expect(simplifyMetadata(undefined)).toEqual({});
    });
});
