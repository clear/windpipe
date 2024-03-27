import { describe, test, vi } from "vitest";
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

describe.concurrent("higher order streams", () => {
    describe.concurrent("flat map", () => {
        test("returning stream", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .flatMap((n) => Stream.from(new Array(n).fill(n)));

            expect(await consumeStream(s)).toEqual([
                ok(1),
                ok(2),
                ok(2),
                ok(3),
                ok(3),
                ok(3),
            ]);
        });

        test("returning stream or error", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1, 2, 3])
                .flatMap<number>((n) => {
                    if (n === 2) {
                        return error("number two");
                    }

                    return Stream.from(new Array(n).fill(n));
                });

            expect(await consumeStream(s)).toEqual([
                ok(1),
                error("number two"),
                ok(3),
                ok(3),
                ok(3),
            ]);
        });

        test("errors already in stream", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([ok(1), error("known error"), ok(2), unknown("bad error", []), ok(3)])
                .flatMap((n) => Stream.from(new Array(n).fill(n)));

            expect(await consumeStream(s)).toEqual([
                ok(1),
                error("known error"),
                ok(2),
                ok(2),
                unknown("bad error", []),
                ok(3),
                ok(3),
                ok(3),
            ]);
        });
    });

    describe.concurrent("otherwise", () => {
        test("empty stream", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from<number, unknown>([])
                .otherwise(Stream.from([1, 2]));

            expect(await consumeStream(s)).toEqual([
                ok(1),
                ok(2),
            ]);
        });

        test("non-empty stream", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([1])
                .otherwise(Stream.from([2, 3]));

            expect(await consumeStream(s)).toEqual([
                ok(1),
            ]);
        });

        test("empty stream with otherwise function", async ({ expect }) => {
            expect.assertions(2);

            const otherwise = vi.fn().mockReturnValue(Stream.from([1, 2]));

            const s = Stream.from<number, unknown>([])
                .otherwise(otherwise);

            expect(await consumeStream(s)).toEqual([ok(1), ok(2)]);
            expect(otherwise).toHaveBeenCalledOnce();
        });

        test("non-empty stream with otherwise function", async ({ expect }) => {
            expect.assertions(2);

            const otherwise = vi.fn().mockReturnValue(Stream.from([2, 3]));

            const s = Stream.from<number, unknown>([1])
                .otherwise(otherwise);

            expect(await consumeStream(s)).toEqual([ok(1)]);
            expect(otherwise).not.toHaveBeenCalled();
        });

        test("stream with known error", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([error("some error")])
                .otherwise(Stream.from([1]));

            expect(await consumeStream(s)).toEqual([error("some error")]);
        });

        test("stream with unknown error", async ({ expect }) => {
            expect.assertions(1);

            const s = Stream.from([unknown("some error", [])])
                .otherwise(Stream.from([1]));

            expect(await consumeStream(s)).toEqual([unknown("some error", [])]);
        });
    });
});

describe.concurrent("stream consumption", () => {
    describe.concurrent("to array", () => {
        test("values", async ({ expect }) => {
            expect.assertions(1);

            const array = await Stream.from([1, 2, 3])
                .toArray();

            expect(array).toEqual([1, 2, 3]);
        });

        test("values with errors on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await Stream.from([1, error("known"), 2, 3, unknown("error", [])])
                .toArray();

            expect(array).toEqual([1, 2, 3]);
        });

        test("values with no items on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await Stream.from([])
                .toArray();

            expect(array).toEqual([]);
        });

        test("atoms", async ({ expect }) => {
            expect.assertions(1);

            const array = await Stream.from([1, 2, 3])
                .toArray({ atoms: true });

            expect(array).toEqual([ok(1), ok(2), ok(3)]);
        });

        test("atoms with errors on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await Stream.from([1, error("known"), 2, 3, unknown("error", [])])
                .toArray({ atoms: true });

            expect(array).toEqual([ok(1), error("known"), ok(2), ok(3), unknown("error", [])]);
        });

        test("atoms with no items on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await Stream.from([])
                .toArray({ atoms: true });

            expect(array).toEqual([]);
        });
    });
});
