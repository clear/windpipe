import { describe, test } from "vitest";
import $ from "../src";

describe.concurrent("error handling", () => {
    test("throw in map", async ({ expect }) => {
        expect.assertions(1);

        const s = $.from([1, 2, 3]).map((n) => {
            if (n === 2) {
                // Unhandled error
                throw new Error("bad number");
            } else {
                return n;
            }
        });

        expect(await s.toArray({ atoms: true })).toEqual([
            $.ok(1),
            $.unknown(new Error("bad number"), ["map"]),
            $.ok(3),
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

        const s = $.from([1, 2, 3]).map(process);

        expect(await s.toArray({ atoms: true })).toEqual([
            $.ok(1),
            $.unknown(new Error("bad number"), ["map"]),
            $.ok(3),
        ]);
    });

    test("track multiple transforms", async ({ expect }) => {
        expect.assertions(1);

        const s = $.from([1, 2, 3, 4, 5])
            .map((n) => {
                if (n === 2) {
                    // Unhandled error
                    throw new Error("bad number");
                } else {
                    return n;
                }
            })
            .filter((n) => n % 2 === 0);

        expect(await s.toArray({ atoms: true })).toEqual([
            $.unknown(new Error("bad number"), ["map"]),
            $.ok(4),
        ]);
    });

    test("error thrown in later transform", async ({ expect }) => {
        expect.assertions(1);

        const s = $.from([1, 2, 3, 4, 5])
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

        expect(await s.toArray({ atoms: true })).toEqual([
            $.unknown(new Error("bad number"), ["filter", "map", "map"]),
            $.ok(30),
            $.ok(4),
            $.ok(50),
        ]);
    });
});
