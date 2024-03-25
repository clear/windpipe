import { describe, test, vi, type ExpectStatic } from "vitest";
import { Stream } from "../../src/streams";
import { ok } from "../../src/streams/atom";
import { Readable } from "stream";

// TODO: This could be an `expect` extension
async function testStream<T, E>(expect: ExpectStatic, stream: Stream<T, E>, values: T[]) {
    const dataSpy = vi.fn();
    const endSpy = vi.fn();

    await new Promise((done) => {
        stream.on("data", dataSpy);
        stream.on("end", endSpy);
        stream.on("close", done);
    });

    expect(dataSpy).toHaveBeenCalledTimes(values.length);
    for (let i = 0; i < values.length; i++) {
        expect(dataSpy).toHaveBeenNthCalledWith(i + 1, ok(values[i]));
    }

    expect(endSpy).toHaveBeenCalledOnce();
}

describe.concurrent("stream creation", () => {
    describe.concurrent("from promise", () => {
        test("resolving promise to emit value", async ({ expect }) => {
            expect.assertions(3);

            await testStream(
                expect,
                Stream.fromPromise(Promise.resolve(10)),
                [10]
            );
        });
    });

    describe.concurrent("from iterator", () => {
        test("multi-value generator", async ({ expect }) => {
            expect.assertions(5);

            await testStream(
                expect,
                Stream.fromIterator(function* () {
                    yield 1;
                    yield 2;
                    yield 3;
                }()),
                [1, 2, 3],
            );
        });

        test("multi-value async generator", async ({ expect }) => {
            expect.assertions(5);

            await testStream(
                expect,
                Stream.fromIterator(async function* () {
                    yield 1;
                    yield 2;
                    yield 3;
                }()),
                [1, 2, 3],
            );
        });
    });

    describe.concurrent("from iterable", () => {
        test("array iterable", async ({ expect }) => {
            expect.assertions(5);

            await testStream(
                expect,
                Stream.fromIterable([1, 2, 3]),
                [1, 2, 3],
            );
        });

        test("readable stream", async ({ expect }) => {
            expect.assertions(5);

            await testStream(
                expect,
                Stream.fromIterable(Readable.from([1, 2, 3])),
                [1, 2, 3],
            );
        });
    });
});

