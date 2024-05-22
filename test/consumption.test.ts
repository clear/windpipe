import { describe, test } from "vitest";
import $ from "../src";
import { Readable } from "node:stream";

describe.concurrent("stream consumption", () => {
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
                $.unknown("$.error", []),
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
                $.unknown("$.error", []),
            ]).toArray({
                atoms: true,
            });

            expect(array).toEqual([
                $.ok(1),
                $.error("known"),
                $.ok(2),
                $.ok(3),
                $.unknown("$.error", []),
            ]);
        });

        test("atoms with no items on stream", async ({ expect }) => {
            expect.assertions(1);

            const array = await $.from([]).toArray({ atoms: true });

            expect(array).toEqual([]);
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
