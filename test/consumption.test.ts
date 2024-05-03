import { describe, test } from "vitest";
import $ from "../src";

describe.concurrent("stream consumption", () => {
    describe.concurrent("to array", () => {
        test("values", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([1, 2, 3]).toArray();

            expect(array).toEqual([1, 2, 3]);
        });

        test("values with errors on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([
                1,
                $.error("known"),
                2,
                3,
                $.unknown("$.error", []),
            ]).toArray();

            expect(array).toEqual([1, 2, 3]);
        });

        test("values with no items on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([]).toArray();

            expect(array).toEqual([]);
        });

        test("atoms", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([1, 2, 3]).toArray({ atoms: true });

            expect(array).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
        });

        test("atoms with errors on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([
                1,
                $.error("known"),
                2,
                3,
                $.unknown("$.error", []),
            ]).toArray({
                atoms: true,
            });

            expect(array).toEqual([
                $.ok(1),
                $.error("known"),
                $.ok(2),
                $.ok(3),
                $.unknown("$.error", []),
            ]);
        });

        test("atoms with no items on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([]).toArray({ atoms: true });

            expect(array).toEqual([]);
        });
    });
});
