import { assert, expect, test } from "vitest";
import { Stream, err, ok, is_err, end, unknown } from "../../src";

test("stream from value", async () => {
    let items = await Stream.of(123).toArray();

    expect(items.length).toEqual(1);
    expect(items[0]).toEqual(123);
});

test("stream from value with ok atom", async () => {
    let items = await Stream.of(ok(123)).toArray();

    expect(items.length).toEqual(1);
    expect(items[0]).toEqual(123);
});

test("stream from value with err atom", async () => {
    let s = Stream.of(err(123));
    let item = await s.next();

    // Expect error to be emitted from stream
    assert(is_err(item));
    expect(item.value).toEqual(123);

    // Expect nothing else to be in the stream
    expect(await s.next()).toEqual(end());
});

test("stream from value with unknown error atom", async () => {
    let s = Stream.of(unknown(123, ["a", "b"]));
    let item = await s.next();

    // Expect error to be emitted from stream
    assert(is_err(item));
    expect(item.value).toEqual(123);

    // Expect nothing else to be in the stream
    expect(await s.next()).toEqual(end());
});
