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
});
