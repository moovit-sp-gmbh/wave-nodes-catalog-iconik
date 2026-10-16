import { buildCreateAssetBody, buildUpdateAssetBody } from "../../lib/helpers/assets";
import { optionalUrl } from "../../lib/helpers/inputs";

const COLLECTION_ID = "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const fields = (overrides: Record<string, unknown> = {}) => ({
    title: "Clip",
    type: undefined,
    collectionId: undefined,
    externalLink: undefined,
    externalId: undefined,
    category: undefined,
    ...overrides,
});

const none = {
    title: undefined,
    externalId: undefined,
    externalLink: undefined,
    category: undefined,
    siteName: undefined,
    warning: undefined,
};

describe("buildCreateAssetBody", () => {
    it("sends only the title and the default type when nothing else is set", () => {
        expect(buildCreateAssetBody(fields({ title: "  Clip  ", collectionId: "", externalId: "  " }), "create asset")).toEqual({
            title: "Clip",
            type: "ASSET",
        });
    });

    it("includes every optional field that is set", () => {
        expect(
            buildCreateAssetBody(
                fields({
                    type: "LINK",
                    collectionId: COLLECTION_ID,
                    externalLink: "https://example.com/a",
                    externalId: "PRJ-4711",
                    category: "News",
                }),
                "create asset"
            )
        ).toEqual({
            title: "Clip",
            type: "LINK",
            collection_id: COLLECTION_ID,
            external_link: "https://example.com/a",
            external_id: "PRJ-4711",
            category: "News",
        });
    });

    it.each([
        [{ title: "   " }, /Asset Title is empty/],
        [{ title: undefined }, /Asset Title is empty/],
        [{ type: "VIDEO" }, /Asset Type "VIDEO" is not supported/],
        [{ collectionId: "abc" }, /Collection ID "abc" is not a UUID/],
        [{ externalLink: "not a url" }, /External Link "not a url" is not a URL/],
    ])("rejects %p", (override, message) => {
        expect(() => buildCreateAssetBody(fields(override), "create asset")).toThrow(message);
    });

    it("accepts an absolute URL as External Link", () => {
        expect(optionalUrl(" https://example.com/x ", "External Link", "create asset")).toBe("https://example.com/x");
        expect(optionalUrl("", "External Link", "create asset")).toBeUndefined();
    });
});

describe("buildUpdateAssetBody", () => {
    it("sends only the fields that are filled in", () => {
        expect(buildUpdateAssetBody({ ...none, title: " New ", warning: "Check rights", externalId: "", category: "  " })).toEqual({
            title: "New",
            warning: "Check rights",
        });
    });

    it("maps every input to its Iconik field", () => {
        expect(
            buildUpdateAssetBody({
                title: "T",
                externalId: "E",
                externalLink: "https://example.com/x",
                category: "C",
                siteName: "S",
                warning: "W",
            })
        ).toEqual({ title: "T", external_id: "E", external_link: "https://example.com/x", category: "C", site_name: "S", warning: "W" });
    });

    it("fails when no field is filled in", () => {
        expect(() => buildUpdateAssetBody(none)).toThrow(/no field to change is filled in/);
        expect(() => buildUpdateAssetBody({ ...none, title: "   " })).toThrow(/no field to change is filled in/);
    });

    it("rejects an External Link that is not a URL", () => {
        expect(() => buildUpdateAssetBody({ ...none, externalLink: "nope" })).toThrow(
            'Could not update asset — External Link "nope" is not a URL'
        );
    });
});
