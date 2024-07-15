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
                $.exception("bad error", []),
                $.ok(3),
            ]).flatMap((n) => $.from(new Array(n).fill(n)));

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.error("known error"),
                $.ok(2),
                $.ok(2),
                $.exception("bad error", []),
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

            const s = $.from([$.exception("some error", [])]).otherwise($.from([1]));

            expect(await s.toArray({ atoms: true })).toEqual([$.exception("some error", [])]);
        });
    });

    describe.concurrent("cachedFlatMap", () => {
        test("lookup non-repeating strings returning single atom", async ({ expect }) => {
            expect.assertions(2);

            const lookup = vi.fn((param: string) => $.of(param));

            const s = $.from(["a", "b", "c"]).cachedFlatMap(lookup, (v) => v);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok("a"), $.ok("b"), $.ok("c")]);
            expect(lookup).toBeCalledTimes(3);
        });

        test("lookup repeating strings returning single atom", async ({ expect }) => {
            expect.assertions(2);

            const lookup = vi.fn((param: string) => $.of(param));

            const s = $.from(["a", "b", "c", "a", "a"]).cachedFlatMap(lookup, (v) => v);

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok("a"),
                $.ok("b"),
                $.ok("c"),
                $.ok("a"),
                $.ok("a"),
            ]);
            expect(lookup).toBeCalledTimes(3);
        });

        test("lookup repeating numbers returning multiple atoms", async ({ expect }) => {
            expect.assertions(2);

            const lookup = vi.fn((n: number) => $.fromArray([n, n * 2, n * 4]));

            const s = $.from([1, 100, 200, 1, 10]).cachedFlatMap(lookup, (v) => v);

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.ok(2),
                $.ok(4),
                $.ok(100),
                $.ok(200),
                $.ok(400),
                $.ok(200),
                $.ok(400),
                $.ok(800),
                $.ok(1),
                $.ok(2),
                $.ok(4),
                $.ok(10),
                $.ok(20),
                $.ok(40),
            ]);
            expect(lookup).toBeCalledTimes(4);
        });

        test("lookup repeating numbers returning multiple atoms", async ({ expect }) => {
            expect.assertions(2);

            const oneHundredDividedBy = vi.fn((n: number) => {
                if (n === 0) {
                    throw "Cannot divide by zero!";
                }

                return $.of(100 / n);
            });

            const s = $.from([5, 0, 50, 5, 5]).cachedFlatMap(oneHundredDividedBy, (v) => v);

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(20),
                $.exception("Cannot divide by zero!", ["cachedFlatMap"]),
                $.ok(2),
                $.ok(20),
                $.ok(20),
            ]);
            expect(oneHundredDividedBy).toBeCalledTimes(3);
        });

        test("lookup repeating numbers, including an error, returning multiple atoms", async ({
            expect,
        }) => {
            expect.assertions(2);

            const lookup = vi.fn((n: number) => $.of(n));

            const s = $.from<number, unknown>([
                $.ok(1),
                $.ok(2),
                $.error("oh no!"),
                $.ok(2),
                $.ok(1),
            ]).cachedFlatMap(lookup, (v) => v);

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.ok(2),
                $.error("oh no!"),
                $.ok(2),
                $.ok(1),
            ]);
            expect(lookup).toBeCalledTimes(2);
        });
    });

    describe.concurrent("flatten", () => {
        test("simple nested stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.from([1, 2]), $.from([3, 4])]).flatten();

            // We should get all values in order
            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3), $.ok(4)]);
        });

        test("no effect on already flat stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3, 4]).flatten();

            // We should get all values in order
            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3), $.ok(4)]);
        });

        test("correctly flattens mixed depth stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, $.from([3, 4])]).flatten();

            // We should get all values in order
            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3), $.ok(4)]);
        });

        test("maintains errors from flattened stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.ok($.from([1, 2])), $.error("oh no")]).flatten();

            // We should get all values in order
            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.error("oh no")]);
        });

        test("flattening an empty stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from<number, unknown>([]).flatten();

            expect(await s.toArray({ atoms: true })).toEqual([]);
        });
    });
});
