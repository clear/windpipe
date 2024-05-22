import { describe, test } from "vitest";
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

    describe.concurrent("from array", () => {
        test("simple array", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromArray([1, 2, 3]);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
        });

        test("array with nullish values", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromArray([1, null, undefined]);

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.ok(null),
                $.ok(undefined),
            ]);
        });

        test("don't modify original array", async ({ expect }) => {
            expect.assertions(2);

            const array = [1, 2, 3];
            const s = $.fromArray(array);

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
            expect(array).toHaveLength(3);
        });
    });

    describe.concurrent("from callback", () => {
        /**
         * Sample function that accepts a node-style callback.
         *
         * @param success - Whether the method should succeed or fail.
         * @param cb - Node-style callback to pass error or value to.
         */
        function someNodeCallback(
            success: boolean,
            cb: (error: string | undefined, value?: number) => void,
        ) {
            if (success) {
                cb(undefined, 123);
            } else {
                cb("an error");
            }
        }

        test("value returned from callback", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromCallback((next) => {
                someNodeCallback(true, next);
            });

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(123)]);
        });

        test("error returned from callback", async ({ expect }) => {
            expect.assertions(1);

            const s = $.fromCallback((next) => {
                someNodeCallback(false, next);
            });

            expect(await s.toArray({ atoms: true })).toEqual([$.error("an error")]);
        });
    });

    describe.concurrent("from next function", () => {
        test("simple count up", async ({ expect }) => {
            expect.assertions(1);

            let i = 0;
            const s = $.fromNext(async () => {
                if (i < 4) {
                    return i++;
                } else {
                    return $.StreamEnd;
                }
            });

            expect(await s.toArray({ atoms: true })).toEqual([$.ok(0), $.ok(1), $.ok(2), $.ok(3)]);
        });

        test("next atoms produces atoms", async ({ expect }) => {
            expect.assertions(1);

            const atoms = [$.ok(0), $.error("some error"), $.ok(1), $.unknown("unknown error", [])];
            const s = $.fromNext(async () => {
                if (atoms.length > 0) {
                    return atoms.shift();
                } else {
                    return $.StreamEnd;
                }
            });

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok(0),
                $.error("some error"),
                $.ok(1),
                $.unknown("unknown error", []),
            ]);
        });

        test("next catches unhandled errors", async ({ expect }) => {
            expect.assertions(1);

            let i = 0;
            const s = $.fromNext(async () => {
                i += 1;

                if (i === 1) {
                    throw "some error";
                }

                if (i == 2) {
                    return i;
                }

                return $.StreamEnd;
            });

            expect(await s.toArray({ atoms: true })).toEqual([
                $.unknown("some error", []),
                $.ok(2),
            ]);
        });
    });
});
