import { describe, test } from "vitest";
import { Stream } from "../../src/streams";
import { ok, error, type Atom, unknown } from "../../src/streams/atom";
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
                        return error("number 2");
                    } else {
                        return ok(n);
                    }
                });

            expect(await consumeStream(s)).toEqual([ok(1), error("number 2"), ok(3)]);
        });

        test("synchronous mix", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .map((n) => {
                    if (n === 2) {
                        return error("number 2");
                    } else {
                        return n;
                    }
                });

            expect(await consumeStream(s)).toEqual([ok(1), error("number 2"), ok(3)]);
        });

        test("asynchronous value", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .map(async (n) => n * 10);

            expect(await consumeStream(s)).toEqual([ok(10), ok(20), ok(30)]);
        });
    });

    describe.concurrent("mapError", () => {
        test("single error", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([error(1), ok(2), ok(3)])
                .mapError((e) => ok("error"));

            expect(await consumeStream(s)).toEqual([ok("error"), ok(2), ok(3)]);
        });

        test("multiple errors", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([error(1), ok(2), error(3)])
                .mapError((e) => ok("error" + e));

            expect(await consumeStream(s)).toEqual([ok("error1"), ok(2), ok("error3")]);
        });
    });

    describe.concurrent("mapUnknown", () => {
        test("single unknown", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([unknown(1, []), ok(2), ok(3)])
                .mapUnknown((e) => error(e));

            expect(await consumeStream(s)).toEqual([error(1), ok(2), ok(3)]);
        });

        test("multiple unknown", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([unknown(1, []), ok(2), unknown(3, [])])
                .mapUnknown((e) => error(e));

            expect(await consumeStream(s)).toEqual([error(1), ok(2), error(3)]);
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

            const s = Stream.from<number, string>([1, error("an error"), 2, 3, 4])
                // Perform the actual filter operation
                .filter((n) => n % 2 === 0);

            expect(await consumeStream(s)).toEqual([error("an error"), ok(2), ok(4)]);
        });
    });
});

describe.concurrent("error handling", () => {
    test("throw in map", async ({ expect }) => {
        expect.assertions(1);

        const s = Stream.from([1, 2, 3])
            .map((n) => {
                if (n === 2) {
                    // Unhandled error
                    throw new Error("bad number");
                } else {
                    return n;
                }
            });

        expect(await consumeStream(s)).toEqual([
            ok(1),
            unknown(new Error("bad number"), ["map"]),
            ok(3),
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

        const s = Stream.from([1, 2, 3])
            .map(process);

        expect(await consumeStream(s)).toEqual([
            ok(1),
            unknown(new Error("bad number"), ["map"]),
            ok(3),
        ]);
    });

    test("track multiple transforms", async ({ expect }) => {
        expect.assertions(1);

        const s = Stream.from([1, 2, 3, 4, 5])
            .map((n) => {
                if (n === 2) {
                    // Unhandled error
                    throw new Error("bad number");
                } else {
                    return n;
                }
            })
            .filter((n) => n % 2 === 0);

        expect(await consumeStream(s)).toEqual([
            unknown(new Error("bad number"), ["map"]),
            ok(4),
        ]);
    });

    test("error thrown in later transform", async ({ expect }) => {
        expect.assertions(1);

        const s = Stream.from([1, 2, 3, 4, 5])
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

        expect(await consumeStream(s)).toEqual([
            unknown(new Error("bad number"), ["filter", "map", "map"]),
            ok(30),
            ok(4),
            ok(50),
        ]);
    });
});
