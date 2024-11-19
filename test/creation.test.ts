import { afterEach, beforeEach, describe, test, vi } from "vitest";
import $ from "../src";
import { Readable } from "stream";

describe("stream creation", () => {
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

            const atoms = [
                $.ok(0),
                $.error("some error"),
                $.ok(1),
                $.exception("unknown error", []),
            ];
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
                $.exception("unknown error", []),
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
                $.exception("some error", []),
                $.ok(2),
            ]);
        });
    });

    describe("fromPusher", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        test("push single value", async ({ expect }) => {
            expect.assertions(1);

            const { stream, push, done } = $.fromPusher();

            // Push a value, then immediately complete
            push(1);
            done();

            expect(await stream.toArray({ atoms: true })).toEqual([$.ok(1)]);
        });

        test("push single value, delayed done", async ({ expect }) => {
            expect.assertions(1);

            const { stream, push, done } = $.fromPusher();

            const streamPromise = stream.toArray({ atoms: true });

            // Push a value
            push(1);

            // Complete at a later point
            setImmediate(() => done());

            await vi.runAllTimersAsync();

            expect(await streamPromise).toEqual([$.ok(1)]);
        });

        test("push single value, not done", async ({ expect }) => {
            expect.assertions(2);

            const { stream, push } = $.fromPusher();

            // Push a value.
            push(1);

            const spy = vi.fn();

            // Ensure the stream never completes.
            stream
                .tap(spy)
                .exhaust()
                .then(() => expect.fail("promise must not resolve"));

            const WAIT_TIME = 10_000;

            // Block the test until the microtask queue is empty, to make sure there's nothing
            // else coming down the stream.
            setTimeout(() => {
                expect(spy).toBeCalledTimes(1);
                expect(spy).toBeCalledWith(1);
            }, WAIT_TIME);

            await vi.advanceTimersByTimeAsync(WAIT_TIME);
        });

        test("multiple values", async ({ expect }) => {
            expect.assertions(1);

            const { stream, push, done } = $.fromPusher();

            push(1);
            push(2);
            push(3);
            push(4);
            done();

            expect(await stream.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.ok(2),
                $.ok(3),
                $.ok(4),
            ]);
        });

        test("multiple atoms", async ({ expect }) => {
            expect.assertions(1);

            const { stream, push, done } = $.fromPusher();

            push($.ok(1));
            push($.ok(2));
            push($.error(3));
            push($.exception(4, []));
            done();

            expect(await stream.toArray({ atoms: true })).toEqual([
                $.ok(1),
                $.ok(2),
                $.error(3),
                $.exception(4, []),
            ]);
        });

        test("no items pushed", async ({ expect }) => {
            expect.assertions(1);

            const { stream, done } = $.fromPusher();

            done();

            expect(await stream.toArray({ atoms: true })).toEqual([]);
        });

        test("push items with delay", async ({ expect }) => {
            expect.assertions(9);

            const spy = vi.fn();

            const { stream, push, done } = $.fromPusher();

            const streamPromise = stream.map(spy).exhaust();

            // Some synchronous values
            push($.ok(1));
            push($.ok(2));

            await vi.runAllTimersAsync();

            // Some timeout values
            setTimeout(() => push($.ok(3)), 1000);
            setTimeout(() => push($.ok(4)), 2000);
            setTimeout(() => push($.ok(5)), 3000);

            // Finish the stream
            setTimeout(() => done(), 4000);

            // Initial assertions
            expect(spy).toHaveBeenCalledTimes(2);
            expect(spy).toHaveBeenNthCalledWith(1, 1);
            expect(spy).toHaveBeenNthCalledWith(2, 2);

            // Async assertions
            await vi.advanceTimersByTimeAsync(1000);
            expect(spy).toHaveBeenCalledTimes(3);
            expect(spy).toHaveBeenNthCalledWith(3, 3);

            await vi.advanceTimersByTimeAsync(1000);
            expect(spy).toHaveBeenCalledTimes(4);
            expect(spy).toHaveBeenNthCalledWith(4, 4);

            await vi.advanceTimersByTimeAsync(1000);
            expect(spy).toHaveBeenCalledTimes(5);
            expect(spy).toHaveBeenNthCalledWith(5, 5);

            // Run everything else thorugh
            await vi.runAllTimersAsync();

            await streamPromise;
        });
    });
});
