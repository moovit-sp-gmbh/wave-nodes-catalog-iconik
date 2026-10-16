import {
    chunk,
    isUuid,
    optionalText,
    optionalUrl,
    optionalUuid,
    parseIdList,
    parseJsonInput,
    requireObjectType,
    requireOption,
    requireUuid,
    requireWholeNumber,
} from "../../lib/helpers/inputs";

const A = "3a1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";
const B = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

describe("IDs", () => {
    it("validates, trims and rejects UUIDs", () => {
        expect(isUuid(B)).toBe(true);
        expect(isUuid("7f3c2a10-4b5d-4e6f-8a9b")).toBe(false);
        expect(requireUuid(` ${B} `, "Asset ID", "get asset")).toBe(B);
        expect(() => requireUuid("abc", "Asset ID", "get asset")).toThrow('Could not get asset — Asset ID "abc" is not a UUID');
        expect(() => requireUuid(undefined, "Asset ID", "get asset")).toThrow(/is not a UUID/);
    });

    it("treats empty optional IDs as absent", () => {
        expect(optionalUuid("  ", "Collection ID", "create asset")).toBeUndefined();
        expect(optionalUuid(undefined, "Collection ID", "create asset")).toBeUndefined();
        expect(optionalUuid(` ${A} `, "Collection ID", "x")).toBe(A);
        expect(() => optionalUuid("abc", "Collection ID", "create asset")).toThrow(/Collection ID "abc" is not a UUID/);
    });

    it("flattens strings, JSON lists and separated IDs into one list", () => {
        expect(parseIdList(A, "IDs", "x")).toEqual([A]);
        expect(parseIdList([JSON.stringify([A, B])], "IDs", "x")).toEqual([A, B]);
        expect(parseIdList([`${A};${B}`, A], "IDs", "x")).toEqual([A, B]);
        expect(() => parseIdList([], "IDs", "x")).toThrow("Could not x — IDs is empty");
        expect(() => parseIdList([1], "IDs", "x")).toThrow("contains a value that is not text");
        expect(() => parseIdList(["[oops"], "IDs", "x")).toThrow("is not a valid list");
    });

    it("splits lists into chunks", () => {
        expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
        expect(chunk([], 2)).toEqual([]);
    });
});

describe("text, URLs, numbers and options", () => {
    it("trims optional text", () => {
        expect(optionalText("  a  ")).toBe("a");
        expect(optionalText(42)).toBe("42");
        expect(optionalText("")).toBeUndefined();
        expect(optionalText(undefined)).toBeUndefined();
    });

    it("accepts absolute URLs only", () => {
        expect(optionalUrl(" https://example.com/x ", "External Link", "create asset")).toBe("https://example.com/x");
        expect(optionalUrl("", "External Link", "create asset")).toBeUndefined();
        expect(() => optionalUrl("nope", "External Link", "create asset")).toThrow('External Link "nope" is not a URL');
    });

    it("applies the fallback and checks the number range", () => {
        expect(requireWholeNumber(undefined, "Results per Page", "search Iconik", 1, 500, 50)).toBe(50);
        expect(requireWholeNumber(500, "Results per Page", "search Iconik", 1, 500, 50)).toBe(500);
        expect(() => requireWholeNumber(501, "Results per Page", "search Iconik", 1, 500, 50)).toThrow("from 1 to 500");
        expect(() => requireWholeNumber(0, "Page", "search Iconik", 1, undefined, 1)).toThrow("of at least 1");
        expect(() => requireWholeNumber(2.5, "Page", "search Iconik", 1, undefined, 1)).toThrow("out of range");
    });

    it("checks select options and the Object Type", () => {
        expect(requireOption(undefined, ["a", "b"] as const, "a", "Mode", "x", "A or B")).toBe("a");
        expect(requireOption(" b ", ["a", "b"] as const, "a", "Mode", "x", "A or B")).toBe("b");
        expect(() => requireOption("c", ["a", "b"] as const, "a", "Mode", "x", "A or B")).toThrow(
            'Could not x — Mode "c" is not supported — choose A or B'
        );
        expect(requireObjectType(undefined, "Object Type", "x")).toBe("assets");
        expect(requireObjectType("collections", "Object Type", "x")).toBe("collections");
        expect(() => requireObjectType("segments", "Object Type", "x")).toThrow("choose Assets or Collections");
    });

    it("parses JSON inputs given as text or as a value", () => {
        expect(parseJsonInput('{"a":1}', "Filter", "x")).toEqual({ a: 1 });
        expect(parseJsonInput({ a: 1 }, "Filter", "x")).toEqual({ a: 1 });
        expect(parseJsonInput("  ", "Filter", "x")).toBeUndefined();
        expect(parseJsonInput(undefined, "Filter", "x")).toBeUndefined();
        expect(() => parseJsonInput("{bad", "Filter", "x")).toThrow("Filter is not valid JSON");
    });
});
