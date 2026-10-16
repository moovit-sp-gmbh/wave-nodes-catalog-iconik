import { IconikFile, IconikFormat, pickOriginalFile } from "../../lib/helpers/files";

const ASSET = "7f3c2a10-4b5d-4e6f-8a9b-0c1d2e3f4a5b";
const FORMAT = "8c7b6a5d-4e3f-4a2b-9c1d-0e9f8a7b6c5d";
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const file = (n: number, extra: Partial<IconikFile> = {}): IconikFile => ({
    id: uuid(n),
    name: `file_${n}.mov`,
    size: 1000 * n,
    status: "CLOSED",
    format_id: FORMAT,
    ...extra,
});

describe("pickOriginalFile", () => {
    const format = { id: FORMAT, archive_status: "NOT_ARCHIVED", is_online: true };

    it("returns the first closed file", () => {
        expect(pickOriginalFile(ASSET, format, [file(1, { status: "OPEN" }), file(2), file(3)]).id).toBe(uuid(2));
    });

    it.each([
        [{ ...format, archive_status: "ARCHIVED" }, [file(1)], /is archived \(archive status ARCHIVED\)/],
        [format, [file(1, { status: "ARCHIVED" })], /original file of asset .* is archived/],
        [format, [file(1, { status: "MISSING" })], /is offline \(file status MISSING\)/],
        [{ ...format, is_online: false }, [file(1, { status: "AWAITED" })], /is offline/],
        [format, [file(1, { status: "GROWING" })], /is not complete \(file status GROWING\)/],
        [format, [], /^Asset has no original file/],
    ])("fails clearly for %p", (fmt, files, message) => {
        expect(() => pickOriginalFile(ASSET, fmt as IconikFormat, files)).toThrow(message);
    });
});
