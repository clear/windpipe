import { describe, test } from "vitest";
import $ from "../src";
import { Readable } from "node:stream";

describe.concurrent("stream consumption", () => {
    describe.concurrent("serialise", () => {
        test("simple number values", async ({ expect }) => {
            expect.assertions(1);

            const jsonStream = $.from([1, 2, 3]).serialise();
            const json = await streamToString(jsonStream);
            expect(json).toEqual("[1,2,3]");
        });

        test("null values", async ({ expect }) => {
            expect.assertions(1);

            const jsonStream = $.from([1, null, 3]).serialise();
            const json = await streamToString(jsonStream);
            expect(json).toEqual("[1,null,3]");
        });

        test("skip undefined values", async ({ expect }) => {
            expect.assertions(1);

            const jsonStream = $.from([1, undefined, 3]).serialise();
            const json = await streamToString(jsonStream);
            expect(json).toEqual("[1,3]");
        });
    });

    describe.concurrent("toArray", () => {
        test("values", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([1, 2, 3]).toArray();

            expect(array).toEqual([1, 2, 3]);
        });

        test("values with errors on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([
                1,
                $.error("known"),
                2,
                3,
                $.exception("$.error", []),
            ]).toArray();

            expect(array).toEqual([1, 2, 3]);
        });

        test("values with no items on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([]).toArray();

            expect(array).toEqual([]);
        });

        test("atoms", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([1, 2, 3]).toArray({ atoms: true });

            expect(array).toEqual([$.ok(1), $.ok(2), $.ok(3)]);
        });

        test("atoms with errors on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([
                1,
                $.error("known"),
                2,
                3,
                $.exception("$.error", []),
            ]).toArray({
                atoms: true,
            });

            expect(array).toEqual([
                $.ok(1),
                $.error("known"),
                $.ok(2),
                $.ok(3),
                $.exception("$.error", []),
            ]);
        });

        test("atoms with no items on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([]).toArray({ atoms: true });

            expect(array).toEqual([]);
        });

        test("reject when error on stream", async ({ expect }) => {
            expect.assertions(1);

            const arrayPromise = $.from([$.ok(1), $.error("some error")]).toArray({ reject: true });

            expect(arrayPromise).rejects.toThrow("some error");
        });
    });

    describe.concurrent("toReadable", () => {
        test("object values", async ({ expect }) => {
            expect.assertions(2);

            const stream = $.from([1, 2, 3]).toReadable("object");
            expect(stream).to.be.instanceof(Readable);

            const values = await promisifyStream(stream);
            expect(values).to.deep.equal([1, 2, 3]);
        });

        test("object atoms", async ({ expect }) => {
            expect.assertions(2);

            const stream = $.from([$.ok(1), $.ok(2), $.error(3)]).toReadable("object", {
                atoms: true,
            });
            expect(stream).to.be.instanceof(Readable);

            const values = await promisifyStream(stream);
            expect(values).to.deep.equal([$.ok(1), $.ok(2), $.error(3)]);
        });

        test("null in object stream", async ({ expect }) => {
            expect.assertions(2);

            const stream = $.from([1, null, 2, 3]).toReadable("object");
            expect(stream).to.be.instanceof(Readable);
            const values = await promisifyStream(stream);
            expect(values).to.deep.equal([1, 2, 3]);
        });

        test("raw values", async ({ expect }) => {
            expect.assertions(2);

            const stream = $.from(["hello", " ", "world"]).toReadable("raw");

            expect(stream).to.be.instanceof(Readable);
            const values = await promisifyStream(stream);
            expect(values.join("")).to.equal("hello world");
        });

        test("error when using object in raw stream", async ({ expect }) => {
            expect.assertions(1);

            // Creating the stream wont panic
            const stream = $.from([1]).toReadable("raw");

            // But reading it will emit an error so this should reject
            const streamPromise = promisifyStream(stream);
            expect(streamPromise).rejects.toBeTruthy();
        });

        test("continue emitting items after non-raw item in raw stream", async ({ expect }) => {
            expect.assertions(2);

            const stream = $.from([1, "valid"]).toReadable("raw");

            const { data, errors } = await emptyStream(stream);

            expect(data).toHaveLength(1);
            expect(errors).toHaveLength(1);
        });

        test("propagate known errors into raw readable stream", async ({ expect }) => {
            expect.assertions(1);

            const stream = promisifyStream(
                $.from([$.ok("a"), $.ok("b"), $.error("some error"), $.ok("c")]).toReadable("raw"),
            );

            expect(stream).rejects.toEqual("some error");
        });

        test("propagate known errors into object readable stream", async ({ expect }) => {
            expect.assertions(1);

            const stream = promisifyStream(
                $.from([$.ok("a"), $.ok("b"), $.error("some error"), $.ok("c")]).toReadable(
                    "object",
                ),
            );

            expect(stream).rejects.toEqual("some error");
        });

        test("propagate multiple errors into readable stream", async ({ expect }) => {
            expect.assertions(2);

            const stream = $.from([
                $.ok("a"),
                $.error("an error"),
                $.ok("b"),
                $.error("some error"),
                $.ok("c"),
            ]).toReadable("object");

            // Monitor the stream
            const { data, errors } = await emptyStream(stream);

            expect(errors).toEqual(["an error", "some error"]);
            expect(data).toEqual(["a", "b", "c"]);
        });

        test("propagate known and unknown errors", async ({ expect }) => {
            expect.assertions(2);

            const stream = $.from([
                $.ok("a"),
                $.error("an error"),
                $.ok("b"),
                $.exception("unknown error", []),
                $.ok("c"),
            ]).toReadable("object");

            // Monitor the stream
            const { data, errors } = await emptyStream(stream);

            expect(errors).toEqual(["an error", "unknown error"]);
            expect(data).toEqual(["a", "b", "c"]);
        });
    });
});

function promisifyStream(stream: Readable): Promise<unknown[]> {
    const data: unknown[] = [];

    return new Promise((resolve, reject) => {
        stream.on("data", (value) => data.push(value));
        stream.on("error", reject);
        stream.on("end", () => resolve(data));
    });
}

async function streamToString(stream: Readable): Promise<string> {
    const textDecoder = new TextDecoder();
    const chunks = await stream.toArray();
    return chunks.map((chunk) => textDecoder.decode(chunk)).join("");
}

async function emptyStream(stream: Readable): Promise<{ data: unknown[]; errors: unknown[] }> {
    const errors: unknown[] = [];
    const data: unknown[] = [];

    await new Promise<void>((resolve) => {
        stream.on("data", (d) => data.push(d));
        stream.on("error", (e: string) => errors.push(e));
        stream.on("end", () => resolve());
    });

    return { data, errors };
}
