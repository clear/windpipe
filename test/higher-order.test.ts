import { describe, test, vi } from "vitest";
import $ from "../src";

describe.concurrent("higher order streams", () => {
    describe.concurrent("flat map", () => {
        test("returning stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3]).flatMap((n) => $.from(new Array(n).fill(n)));

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.ok(2),
                $.ok(2),
                $.ok(3),
                $.ok(3),
                $.ok(3),
            ]);
        });

        test("errors already in stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([
                $.ok(1),
                $.error("known error"),
                $.ok(2),
                $.unknown("bad error", []),
                $.ok(3),
            ]).flatMap((n) => $.from(new Array(n).fill(n)));

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.error("known error"),
                $.ok(2),
                $.ok(2),
                $.unknown("bad error", []),
                $.ok(3),
                $.ok(3),
                $.ok(3),
            ]);
        });
    });

    describe.concurrent("flat tap", () => {
        test("simple stream", async ({ expect }) => {
            expect.assertions(3);

            const subCallback = vi.fn();
            const callback = vi.fn().mockImplementation((n) => $.of(n * n).tap(subCallback));
            const s = $.from([1, 2, 3, 4]).flatTap(callback);

            // Ensure that the flat tap doesn't alter the emitted stream items
            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3), $.ok(4)]);

            // Ensure that the flatTap implementation is called once for each item in the stream
            expect(callback).toBeCalledTimes(4);

            // Ensure that the stream returned from flatTap is fully executed
            expect(subCallback).toBeCalledTimes(4);
        });

        test("simple stream", async ({ expect }) => {
            expect.assertions(2);

            const callback = vi.fn().mockImplementation((n) => $.of(n * n));
            const s = $.from([1, 2, 3, 4]).flatTap(callback);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3), $.ok(4)]);
            expect(callback).toBeCalledTimes(4);
        });
    });

    describe.concurrent("otherwise", () => {
        test("empty stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from<number, unknown>([]).otherwise($.from([1, 2]));

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2)]);
        });

        test("non-empty stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1]).otherwise($.from([2, 3]));

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1)]);
        });

        test("empty stream with otherwise function", async ({ expect }) => {
            expect.assertions(2);

            const otherwise = vi.fn().mockReturnValue($.from([1, 2]));

            const s = $.from<number, unknown>([]).otherwise(otherwise);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2)]);
            expect(otherwise).toHaveBeenCalledOnce();
        });

        test("non-empty stream with otherwise function", async ({ expect }) => {
            expect.assertions(2);

            const otherwise = vi.fn().mockReturnValue($.from([2, 3]));

            const s = $.from<number, unknown>([1]).otherwise(otherwise);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1)]);
            expect(otherwise).not.toHaveBeenCalled();
        });

        test("stream with known error", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.error("some error")]).otherwise($.from([1]));

            expect(await s.toArray({ atoms: true })).toEqual([$.error("some error")]);
        });

        test("stream with unknown error", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.unknown("some error", [])]).otherwise($.from([1]));

            expect(await s.toArray({ atoms: true })).toEqual([$.unknown("some error", [])]);
        });
    });

});

