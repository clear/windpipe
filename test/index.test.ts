import { describe, test, vi } from "vitest";
import $ from "../src";
import { Readable } from "stream";

describe.concurrent("stream creation", () => {
    describe.concurrent("from promise", () => {
        test("resolving promise to emit value", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromPromise(Promise.resolve(10));

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(10)]);
        });
    });

    describe.concurrent("from iterator", () => {
        test("multi-value generator", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromIterator(
                (function* () {
                    yield 1;
                    yield 2;
                    yield 3;
                })(),
            );

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
        });

        test("multi-value async generator", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromIterator(
                (async function* () {
                    yield 1;
                    yield 2;
                    yield 3;
                })(),
            );

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
        });
    });

    describe.concurrent("from iterable", () => {
        test("array iterable", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromIterable([1, 2, 3]);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
        });

        test("readable stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromIterable(Readable.from([1, 2, 3]));

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
        });
    });
});

describe.concurrent("stream transforms", () => {
    describe.concurrent("map", () => {
        test("synchronous value", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3]).map((n) => n * 10);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(10), $.ok(20), $.ok(30)]);
        });

        test("synchronous atom", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3]).map((n) => {
                if (n === 2) {
                    return $.error("number 2");
                } else {
                    return $.ok(n);
                }
            });

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.error("number 2"),
                $.ok(3),
            ]);
        });

        test("synchronous mix", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3]).map((n) => {
                if (n === 2) {
                    return $.error("number 2");
                } else {
                    return n;
                }
            });

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.error("number 2"),
                $.ok(3),
            ]);
        });

        test("asynchronous value", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3]).map(async (n) => n * 10);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(10), $.ok(20), $.ok(30)]);
        });
    });

    describe.concurrent("mapError", () => {
        test("single error", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.error(1), $.ok(2), $.ok(3)]).mapError((_e) => $.ok("error"));

            expect(await s.toArray({ atoms: true })).toEqual([$.ok("error"), $.ok(2), $.ok(3)]);
        });

        test("multiple errors", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.error(1), $.ok(2), $.error(3)]).mapError((e) => $.ok("error" + e));

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok("error1"),
                $.ok(2),
                $.ok("error3"),
            ]);
        });
    });

    describe.concurrent("mapUnknown", () => {
        test("single unknown", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.unknown(1, []), $.ok(2), $.ok(3)]).mapUnknown((e) => $.error(e));

            expect(await s.toArray({ atoms: true })).toEqual([$.error(1), $.ok(2), $.ok(3)]);
        });

        test("multiple unknown", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.unknown(1, []), $.ok(2), $.unknown(3, [])]).mapUnknown((e) =>
                $.error(e),
            );

            expect(await s.toArray({ atoms: true })).toEqual([$.error(1), $.ok(2), $.error(3)]);
        });
    });

    describe.concurrent("filter", () => {
        test("synchronous values", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3, 4]).filter((n) => n % 2 === 0);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(2), $.ok(4)]);
        });

        test("synchronous atoms", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from<number, string>([1, $.error("an error"), 2, 3, 4])
                // Perform the actual filter operation
                .filter((n) => n % 2 === 0);

            expect(await s.toArray({ atoms: true })).toEqual([
                $.error("an error"),
                $.ok(2),
                $.ok(4),
            ]);
        });
    });

    describe.concurrent("drop", () => {
        test("multiple values", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3, 4, 5]).drop(2);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(3), $.ok(4), $.ok(5)]);
        });

        test("multiple values with errors", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, $.error("some error"), 2, 3, 4, 5]).drop(2);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(3), $.ok(4), $.ok(5)]);
        });

        test("multiple atoms", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3, 4, 5]).drop(2, { atoms: true });

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(3), $.ok(4), $.ok(5)]);
        });

        test("multiple atoms with errors", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, $.error("some error"), 2, 3, 4, 5]).drop(2, { atoms: true });

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(2), $.ok(3), $.ok(4), $.ok(5)]);
        });
    });
});

describe.concurrent("error handling", () => {
    test("throw in map", async ({ expect }) => {
        expect.assertions(1);

        const s = $.from([1, 2, 3]).map((n) => {
            if (n === 2) {
                // Unhandled error
                throw new Error("bad number");
            } else {
                return n;
            }
        });

        expect(await s.toArray({ atoms: true })).toEqual([
            $.ok(1),
            $.unknown(new Error("bad number"), ["map"]),
            $.ok(3),
        ]);
    });

    test("promise rejection in map", async ({ expect }) => {
        expect.assertions(1);

        async function process(n: number) {
            if (n === 2) {
                throw new Error("bad number");
            } else {
                return n;
            }
        }

        const s = $.from([1, 2, 3]).map(process);

        expect(await s.toArray({ atoms: true })).toEqual([
            $.ok(1),
            $.unknown(new Error("bad number"), ["map"]),
            $.ok(3),
        ]);
    });

    test("track multiple transforms", async ({ expect }) => {
        expect.assertions(1);

        const s = $.from([1, 2, 3, 4, 5])
            .map((n) => {
                if (n === 2) {
                    // Unhandled error
                    throw new Error("bad number");
                } else {
                    return n;
                }
            })
            .filter((n) => n % 2 === 0);

        expect(await s.toArray({ atoms: true })).toEqual([
            $.unknown(new Error("bad number"), ["map"]),
            $.ok(4),
        ]);
    });

    test("error thrown in later transform", async ({ expect }) => {
        expect.assertions(1);

        const s = $.from([1, 2, 3, 4, 5])
            .filter((n) => n > 1)
            .map((n) => {
                if (n % 2 === 1) {
                    return n * 10;
                } else {
                    return n;
                }
            })
            .map((n) => {
                if (n === 2) {
                    // Unhandled error
                    throw new Error("bad number");
                } else {
                    return n;
                }
            })
            .filter((n) => n % 2 === 0);

        expect(await s.toArray({ atoms: true })).toEqual([
            $.unknown(new Error("bad number"), ["filter", "map", "map"]),
            $.ok(30),
            $.ok(4),
            $.ok(50),
        ]);
    });
});

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

        test("returning stream or error", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3]).flatMap<number>((n) => {
                if (n === 2) {
                    return $.error("number two");
                }

                return $.from(new Array(n).fill(n));
            });

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.error("number two"),
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
