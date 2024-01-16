import { describe, expect, test, vi } from "vitest";
import { Stream } from "../src";
import { UNKNOWN, end, ok, type AtomUnknown, VALUE, type AtomOk, err, unknown, type AtomErr, type AtomEnd, END, ERROR } from "../src/atom";

test("calls atom producer until exhuasted", async () => {
    let counter = 0;
    const numbers = await new Stream((done) => {
        counter += 1;

        if (counter === 4) {
            done(end());
        } else {
            done(ok(counter));
        }
    })
        .toArray();

    // The stream should only contain numbers 1 - 3
    expect(numbers).toMatchObject([1, 2, 3]);

    // The atom producer should only be called 4 times in total (3 values, plus end)
    expect(counter).toBe(4);
});

describe("proxy_user_function", () => {
    const s = Stream.empty();
    const proxy_user_function = s["proxy_user_function"].bind(s);

    test("handles value", () => {
        const atom = proxy_user_function(() => {
            return 123;
        }) as AtomOk<number>;

        expect(atom.type).toBe(VALUE);
        expect(atom.value).toBe(123);
    });

    test("handles thrown errors", () => {
        const atom = proxy_user_function(() => {
            throw new Error("custom error");
        }) as AtomUnknown;

        expect(atom.type).toBe(UNKNOWN);
        expect(atom.value).toBeInstanceOf(Error);

        const error = atom.value as Error;
        expect(error.message).toBe("custom error");
    });

    test("handles thrown errors with trace", () => {
        const s = Stream.empty();
        s["trace"].push("operation", "another_operation");

        const atom = s["proxy_user_function"](() => {
            throw new Error("custom error");
        }) as AtomUnknown;

        expect(atom.type).toBe(UNKNOWN);
        expect(atom.value).toBeInstanceOf(Error);
        expect(atom.trace).toMatchObject(["operation", "another_operation"]);

        const error = atom.value as Error;
        expect(error.message).toBe("custom error");
    });

    test("handles `ok` value", () => {
        const atom = proxy_user_function(() => {
            return ok(123);
        }) as AtomOk<number>;

        expect(atom.type).toBe(VALUE);
        expect(atom.value).toBe(123);
    });

    test("handles `err` value", () => {
        const atom = proxy_user_function(() => {
            return err(123);
        }) as AtomErr<number>;

        expect(atom.type).toBe(ERROR);
        expect(atom.value).toBe(123);
    });

    test("handles `unknown` value", () => {
        const atom = proxy_user_function(() => {
            return unknown(123, []);
        }) as AtomUnknown;

        expect(atom.type).toBe(UNKNOWN);
        expect(atom.value).toBe(123);
    });

    test("handles `end` value", () => {
        const atom = proxy_user_function(() => {
            return end();
        }) as AtomEnd;

        expect(atom.type).toBe(END);
    });
});

describe("clone_stream", () => {
    test("state retained", () => {
        const s = Stream.empty();
        const s_other = Stream.empty();

        // Set up the state of the previous stream
        s["last_trace"] = s_other;
        s["trace"] = ["a", "b", "c"];

        const new_s = s["clone_stream"](() => {});

        expect(new_s).not.toBe(s);
        expect(new_s["last_trace"]).toBe(s_other);
        expect(new_s["trace"]).toMatchObject(["a", "b", "c"]);
    });

    test("new producer called, and old producer no longer called", () => {
        const old_producer = vi.fn();
        const new_producer = vi.fn();

        const s = new Stream(old_producer)
        const new_s = s["clone_stream"](new_producer);

        new_s.next();

        expect(old_producer).toBeCalledTimes(0);
        expect(new_producer).toBeCalledTimes(1);
    });
});

describe("t", () => {
    test("updates trace if not yet added", () => {
        const s = Stream.empty();
        s["t"]("test");

        expect(s["trace"]).toMatchObject(["test"]);
        expect(s["last_trace"]).toBe(s);
    });

    test("trace is ignored if already added", () => {
        const s = Stream.empty();
        s["last_trace"] = s;
        s["t"]("test");

        expect(s["trace"]).toHaveLength(0);
    });

    test("new traces are appended", () => {
        const s = Stream.empty();

        s["t"]("a");

        // Clear last trace to be able to continue adding items
        s["last_trace"] = null;

        s["t"]("b");

        expect(s["trace"]).toMatchObject(["a", "b"]);
    });
});

describe("next", () => {
    test("one call leads to one call of atom producer", async () => {
        const atom_producer = vi.fn((done) => {
            done(ok(1));
        });

        const s = new Stream(atom_producer);
        await s.next();

        expect(atom_producer).toBeCalledTimes(1);
    });

    test("multiple calls leads to same number of calls to atom producer", async () => {
        const atom_producer = vi.fn((done) => {
            done(ok(1));
        });

        const s = new Stream(atom_producer);

        await s.next();
        await s.next();
        await s.next();
        await s.next();

        expect(atom_producer).toBeCalledTimes(4);
    });
});
