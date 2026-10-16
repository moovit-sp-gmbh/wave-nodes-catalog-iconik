import { IconikCollection, findExistingCollection } from "../../lib/helpers/collections";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const coll = (n: number, title: string, extra: Partial<IconikCollection> = {}): IconikCollection => ({
    id: uuid(n),
    title,
    status: "ACTIVE",
    object_type: "collections",
    date_created: `2026-01-${String(10 + (n % 10)).padStart(2, "0")}T00:00:00Z`,
    ...extra,
});

describe("findExistingCollection", () => {
    it("matches trimmed titles case-sensitively, only active collections, oldest first", () => {
        const candidates = [
            coll(1, "Campaign", { date_created: "2026-03-01T00:00:00Z" }),
            coll(2, " Campaign ", { date_created: "2026-02-01T00:00:00Z" }),
            coll(3, "campaign", { date_created: "2026-01-01T00:00:00Z" }),
            coll(4, "Campaign", { status: "DELETED", date_created: "2025-01-01T00:00:00Z" }),
            coll(5, "Campaign", { object_type: "assets", date_created: "2025-01-01T00:00:00Z" }),
        ];
        expect(findExistingCollection(candidates, "Campaign")?.id).toBe(uuid(2));
        expect(findExistingCollection(candidates, "Other")).toBeUndefined();
    });
});
