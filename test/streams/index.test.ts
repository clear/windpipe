import { describe, test } from "vitest";
import { Stream } from "../../src/streams";
import { ok, type Atom } from "../../src/streams/atom";
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
        test("synchronous", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .map((n) => n * 10);

            expect(await consumeStream(s)).toEqual([ok(10), ok(20), ok(30)]);
        });
    });
});
