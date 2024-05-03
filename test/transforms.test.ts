import { describe, test } from "vitest";
import $ from "../src";

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
