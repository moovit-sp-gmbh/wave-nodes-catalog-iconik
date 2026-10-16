import { buildSearchBody } from "../../lib/helpers/search";

const fields = (o: Record<string, unknown> = {}) => ({
    query: undefined,
    objectTypes: undefined,
    filter: undefined,
    sort: undefined,
    ...o,
});

describe("buildSearchBody", () => {
    it("searches assets by default and sends only what is set", () => {
        expect(buildSearchBody(fields({ query: " summer " }))).toEqual({ doc_types: ["assets"], query: "summer" });
    });

    it("passes filter and sort through unchanged and supports both object types", () => {
        const filter = { operator: "AND", terms: [{ name: "status", value: "ACTIVE" }] };
        const sort = [{ name: "date_created", order: "desc" }];
        expect(
            buildSearchBody(fields({ objectTypes: "assets,collections", filter: JSON.stringify(filter), sort: JSON.stringify(sort) }))
        ).toEqual({ doc_types: ["assets", "collections"], filter, sort });
        expect(buildSearchBody(fields({ filter }))).toEqual({ doc_types: ["assets"], filter });
    });

    it("sends no query or filter when neither is set", () => {
        expect(buildSearchBody(fields())).toEqual({ doc_types: ["assets"] });
        expect(buildSearchBody(fields({ query: "  ", filter: "  " }))).toEqual({ doc_types: ["assets"] });
    });

    it.each([
        [{ filter: "{bad" }, /Search Filter is not valid JSON/],
        [{ filter: "[1]" }, /Search Filter is not a JSON object/],
        [{ query: "x", sort: '{"name":"title"}' }, /Sort Order is not a JSON array/],
        [{ query: "x", objectTypes: "segments" }, /Object Types "segments" is not supported/],
    ])("rejects %p", (override, message) => {
        expect(() => buildSearchBody(fields(override))).toThrow(message);
    });
});
