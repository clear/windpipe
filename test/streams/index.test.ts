import { describe, test } from "vitest";
import { Stream } from "../../src/streams";
import { ok, err, type Atom } from "../../src/streams/atom";
import { Readable } from "stream";

async function consumeStream<T, E>(s: Stream<T, E>): Promise<Atom<T, E>[]> {
    const values = [];
    for await (const v of s) {
        values.push(v);
    }
    return values;
}

describe.concurrent("stream creation", () => {
    describe.concurrent("from promise", () => {
        test("resolving promise to emit value", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.fromPromise(Promise.resolve(10));

            expect(await consumeStream(s)).toEqual([ok(10)]);
        });
    });

    describe.concurrent("from iterator", () => {
        test("multi-value generator", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.fromIterator(function* () {
                yield 1;
                yield 2;
                yield 3;
            }());

            expect(await consumeStream(s)).toEqual([ok(1), ok(2), ok(3)]);
        });

        test("multi-value async generator", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.fromIterator(async function* () {
                yield 1;
                yield 2;
                yield 3;
            }());

            expect(await consumeStream(s)).toEqual([ok(1), ok(2), ok(3)]);
        });
    });

    describe.concurrent("from iterable", () => {
        test("array iterable", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.fromIterable([1, 2, 3]);

            expect(await consumeStream(s)).toEqual([ok(1), ok(2), ok(3)]);
        });

        test("readable stream", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.fromIterable(Readable.from([1, 2, 3]));

            expect(await consumeStream(s)).toEqual([ok(1), ok(2), ok(3)]);
        });
    });
});

describe.concurrent("stream transforms", () => {
    describe.concurrent("map", () => {
        test("synchronous value", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .map((n) => n * 10);

            expect(await consumeStream(s)).toEqual([ok(10), ok(20), ok(30)]);
        });

        test("synchronous atom", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .map((n) => {
                    if (n === 2) {
                        return err("number 2");
                    } else {
                        return ok(n);
                    }
                });

            expect(await consumeStream(s)).toEqual([ok(1), err("number 2"), ok(3)]);
        });

        test("synchronous mix", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .map((n) => {
                    if (n === 2) {
                        return err("number 2");
                    } else {
                        return n;
                    }
                });

            expect(await consumeStream(s)).toEqual([ok(1), err("number 2"), ok(3)]);
        });
    });

    describe.concurrent("mapError", () => {
        test("single error", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([err(1), ok(2), ok(3)])
                .mapError((e) => ok("error"));

            expect(await consumeStream(s)).toEqual([ok("error"), ok(2), ok(3)]);
        });

        test("multiple errors", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([err(1), ok(2), err(3)])
                .mapError((e) => ok("error" + e));

            expect(await consumeStream(s)).toEqual([ok("error1"), ok(2), ok("error3")]);
        });
    });

    describe.concurrent("filter", () => {
        test("synchronous values", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3, 4])
                .filter((n) => n % 2 === 0);

            expect(await consumeStream(s)).toEqual([ok(2), ok(4)]);
        });

        test("synchronous atoms", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from<number, string>([1, err("an error"), 2, 3, 4])
                // Perform the actual filter operation
                .filter((n) => n % 2 === 0);

            expect(await consumeStream(s)).toEqual([err("an error"), ok(2), ok(4)]);
        });
    });
});
