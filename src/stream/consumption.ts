import { Readable } from "node:stream";
import { isOk, type Atom } from "../atom";
import { StreamBase } from "./base";

export class StreamConsumption<T, E> extends StreamBase {
    /**
     * Create an iterator that will emit each atom in the stream.
     *
     * @group Consumption
     */
    [Symbol.asyncIterator](): AsyncIterator<Atom<T, E>> {
        return this.stream[Symbol.asyncIterator]();
    }

    /**
     * Create an async iterator that will emit each value in the stream.
     *
     * @group Consumption
     */
    values(): AsyncIterableIterator<T> {
        const it = this[Symbol.asyncIterator]();

        async function next() {
            const { value, done } = await it.next();

            if (done) {
                return { value, done: true };
            } else if (isOk(value)) {
                return { value: value.value };
            } else {
                return await next();
            }
        }

        return {
            [Symbol.asyncIterator](): AsyncIterableIterator<T> {
                // WARN: This feels weird, however it follows what the types require
                return {
                    [Symbol.asyncIterator]: this[Symbol.asyncIterator],
                    next,
                };
            },
            next,
        };
    }

    /**
     * Iterate through each atom in the stream, and return them as a single array.
     *
     * @param options.atom - Return every atom on the stream.
     *
     * @group Consumption
     */
    async toArray(options?: { atoms: false }): Promise<T[]>;
    async toArray(options?: { atoms: true }): Promise<Atom<T, E>[]>;
    async toArray({ atoms = false }: { atoms?: boolean } = {}): Promise<(Atom<T, E> | T)[]> {
        const array: (Atom<T, E> | T)[] = [];

        for await (const atom of this) {
            if (atoms) {
                array.push(atom);
            } else if (isOk(atom)) {
                array.push(atom.value);
            }
        }

        return array;
    }

    /**
     * Serialise the stream, and produce a Node stream with the serialised result.
     *
     * @param options.single - Whether to emit an array for multiple items, or only a single item.
     * @param options.atoms - By default, only `ok` values are serialised, however enabling this
     * will serialise all values.
     *
     * @group Consumption
     */
    serialise(options?: { single?: boolean; atoms?: boolean }): Readable {
        // Set up a new readable stream that does nothing
        const s = new Readable({
            read() {},
        });

        // Spin off asynchronously so that the stream can be immediately returned
        (async () => {
            let sentItems = 0;

            if (options?.single !== true) {
                s.push("[");
            }

            for await (const atom of this) {
                // Determine whether non-ok values should be filtered out
                if (options?.atoms !== true && !isOk(atom)) {
                    continue;
                }

                if (sentItems > 0) {
                    if (options?.single) {
                        // Monitor for multiple values being sent when only one is desired
                        console.warn(
                            "indicated that stream would serialise to a single value, however multiple were emitted (ignoring)",
                        );
                        break;
                    } else {
                        // Comma seperate multiple values
                        s.push(",");
                    }
                }

                s.push(JSON.stringify(options?.atoms ? atom : atom.value));

                sentItems += 1;
            }

            if (options?.single !== true) {
                s.push("]");
            }

            // End the stream
            s.push(null);
        })();

        return s;
    }
}
