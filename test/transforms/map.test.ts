import { expect, test } from "vitest";
import { Stream } from "../../src";

test("applies operation to values in stream", async () => {
    const numbers = await Stream.from([1, 2, 3])
        .map((n) => n * 2)
        .toArray();

    expect(numbers)
        .toMatchObject([2, 4, 6]);
});

test("happy with empty stream", async () => {
    const numbers = await Stream.empty<number, unknown>()
        .map((n) => n * 2)
        .toArray();

    expect(numbers)
        .toMatchObject([]);
});

test("does nothing with identity function", async () => {
    const numbers = await Stream.from([1, 2, 3])
        .map((n) => n)
        .toArray();

    expect(numbers)
        .toMatchObject([1, 2, 3]);
});
