import { afterEach, beforeEach, describe, test, vi } from "vitest";
import $ from "../src";

describe("stream transforms", () => {
    describe("map", () => {
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

    describe("collect", () => {
        test("simple stream without errors", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([1, 2, 3]).collect();

            expect(await s.toArray({ atoms: true })).toEqual([$.ok([1, 2, 3])]);
        });

        test("empty stream", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([]).collect();

            expect(await s.toArray({ atoms: true })).toEqual([$.ok([])]);
        });

        test("single error", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.error(1), $.ok(2), $.ok(3)]).collect();

            expect(await s.toArray({ atoms: true })).toEqual([$.error(1), $.ok([2, 3])]);
        });

        test("single unknown", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([$.unknown(1, []), $.ok(2), $.ok(3)]).collect();

            expect(await s.toArray({ atoms: true })).toEqual([$.unknown(1, []), $.ok([2, 3])]);
        });
    });

    describe("mapError", () => {
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

    describe("mapUnknown", () => {
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

    describe("filter", () => {
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

    describe("drop", () => {
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

    describe("bufferedMap", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.restoreAllMocks();
        });

        function timeout(ms: number) {
            return new Promise<void>((resolve) => {
                setTimeout(() => {
                    resolve();
                }, ms);
            });
        }

        test("multiple values", async ({ expect }) => {
            expect.assertions(2);

            // Will infinitely produce values
            const counter = vi.fn();

            let i = 0;
            const s = $.fromNext(async () => {
                if (i === 10) {
                    return $.StreamEnd;
                }

                return i++;
            })
                .bufferedMap(async (n) => {
                    // Do some slow work
                    await timeout(10);

                    return n;
                })
                .tap(counter)
                .toArray({ atoms: true });

            await vi.advanceTimersByTimeAsync(50);

            expect(await s).toEqual([
                $.ok(0),
                $.ok(1),
                $.ok(2),
                $.ok(3),
                $.ok(4),
                $.ok(5),
                $.ok(6),
                $.ok(7),
                $.ok(8),
                $.ok(9),
            ]);

            expect(counter).toBeCalledTimes(10);
        });

        test("slow producer", async ({ expect }) => {
            expect.assertions(2);

            // Producer that will never produce a value
            const producer = vi.fn().mockReturnValue(new Promise(() => {}));
            const counter = vi.fn();

            $.fromNext(producer).bufferedMap(counter).exhaust();

            // Give some time for everything to spin
            await vi.advanceTimersByTimeAsync(50);

            expect(producer).toBeCalledTimes(1);
            expect(counter).toBeCalledTimes(0);
        });

        test("slow producer, slow operation", async ({ expect }) => {
            expect.assertions(15);

            const producer = vi.fn(async () => {
                await timeout(10);
                return i++;
            });
            const mapper = vi.fn(async (n) => {
                await timeout(20);

                return n;
            });
            const counter = vi.fn();

            let i = 0;

            $.fromNext(producer).bufferedMap(mapper).tap(counter).exhaust();

            // 9ms, producer should only be called once
            await vi.advanceTimersByTimeAsync(9);
            expect(producer).toHaveBeenCalledTimes(1);
            expect(mapper).toHaveBeenCalledTimes(0);
            expect(counter).toHaveBeenCalledTimes(0);

            // 10ms, producer output value, mapper begins
            await vi.advanceTimersByTimeAsync(1);
            expect(producer).toHaveBeenCalledTimes(2);
            expect(mapper).toHaveBeenCalledTimes(1);
            expect(counter).toHaveBeenCalledTimes(0);

            // 20ms, producer output another value, another mapper begins
            await vi.advanceTimersByTimeAsync(10);
            expect(producer).toHaveBeenCalledTimes(3);
            expect(mapper).toHaveBeenCalledTimes(2);
            expect(counter).toHaveBeenCalledTimes(0);

            // 30ms, producer output another value, another mapper begins, first mapper finish
            await vi.advanceTimersByTimeAsync(10);
            expect(producer).toHaveBeenCalledTimes(4);
            expect(mapper).toHaveBeenCalledTimes(3);
            expect(counter).toHaveBeenCalledTimes(1);

            // 40ms, producer output another value, another mapper begins, second mapper finish
            await vi.advanceTimersByTimeAsync(10);
            expect(producer).toHaveBeenCalledTimes(5);
            expect(mapper).toHaveBeenCalledTimes(4);
            expect(counter).toHaveBeenCalledTimes(2);
        });
    });

    describe.sequential("batch", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        test("2 items", async ({ expect }) => {
            expect.assertions(1);

            let i = 0;
            const s = $.fromNext(() => {
                return new Promise((res) => res(i++));
            })
                .batch({ n: 2 })
                .take(3);

            expect(await s.toArray({ atoms: true })).toEqual([
                $.ok([0, 1]),
                $.ok([2, 3]),
                $.ok([4, 5]),
            ]);
        });

        test("yield remaining true", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([0, 1, 2, 3, 4]).batch({ n: 3, yieldRemaining: true });

            expect(await s.toArray({ atoms: true })).toEqual([$.ok([0, 1, 2]), $.ok([3, 4])]);
        });

        test("yield remaining false", async ({ expect }) => {
            expect.assertions(1);

            const s = $.from([0, 1, 2, 3, 4]).batch({ n: 3, yieldRemaining: false });

            expect(await s.toArray({ atoms: true })).toEqual([$.ok([0, 1, 2])]);
        });

        test("with timeout", async ({ expect }) => {
            expect.assertions(3);

            const mapper = vi.fn();

            let i = 0;
            $.fromNext(async () => {
                return i++;
            })
                .batch({ timeout: 100 })
                .map(mapper)
                .exhaust();

            await vi.advanceTimersByTimeAsync(100);
            expect(mapper).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(50);
            expect(mapper).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(50);
            expect(mapper).toHaveBeenCalledTimes(2);
        });

        test("with timeout yield empty", async ({ expect }) => {
            expect.assertions(5);

            const mapper = vi.fn();

            $.fromNext(() => {
                // Promise that will never resolve
                return new Promise(() => {});
            })
                .batch({ timeout: 100, yieldEmpty: true })
                .map(mapper)
                .exhaust();

            await vi.advanceTimersByTimeAsync(100);
            expect(mapper).toHaveBeenCalledTimes(1);
            expect(mapper).toHaveBeenNthCalledWith(1, []);

            await vi.advanceTimersByTimeAsync(50);
            expect(mapper).toHaveBeenCalledTimes(1);

            await vi.advanceTimersByTimeAsync(50);
            expect(mapper).toHaveBeenCalledTimes(2);
            expect(mapper).toHaveBeenNthCalledWith(2, []);
        });

        test("n with timeout", async ({ expect }) => {
            const mapper = vi.fn();

            $.from([1, 2, 3, 4, 5]).batch({ n: 3, timeout: 100 }).map(mapper).exhaust();

            await vi.advanceTimersByTimeAsync(50);
            expect(mapper).toHaveBeenCalledTimes(1);
            expect(mapper).toHaveBeenNthCalledWith(1, [1, 2, 3]);

            await vi.advanceTimersByTimeAsync(50);
            expect(mapper).toHaveBeenCalledTimes(2);
            expect(mapper).toHaveBeenNthCalledWith(2, [4, 5]);
        });

        test("with bucket", async ({ expect }) => {
            expect.assertions(1);

            const s = await $.from([1, 2, 3, 4, 5, 6])
                .batch({ n: 2, byBucket: (n) => (n % 2 === 0 ? "even" : "odd") })
                .toArray();

            expect(s).toEqual([
                [1, 3],
                [2, 4],
            ]);
        });
    });
});
