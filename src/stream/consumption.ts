import { Readable } from "node:stream";
import { isOk, type Atom } from "../atom";
import { StreamBase } from "./base";
import { exhaust } from "../util";

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
     * Completely exhaust the stream, driving it to completion. This is particularly useful when
     * side effects of the stream are desired, but the actual values of the stream are not needed.
     */
    exhaust(): Promise<void> {
        return exhaust(this);
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
     * @param options.atoms - Return every atom on the stream.
     *
     * @group Consumption
     */
    async toArray(options?: { atoms: false }): Promise<T[]>;
    async toArray(options?: { atoms: true }): Promise<Atom<T, E>[]>;
    async toArray(options?: { atoms?: boolean }): Promise<(Atom<T, E> | T)[]> {
        const array: (Atom<T, E> | T)[] = [];

        for await (const atom of this) {
            if (options?.atoms) {
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
     * @see {@link Stream#toReadable} if serialisation is not required
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

    /**
     * Produce a readable node stream with the values from the stream.
     *
     * @param kind - What kind of readable stream to produce. When "raw" only strings and buffers can be emitted on the stream. Use "object" to preserve
     * objects in the readable stream. Note that object values are not serialised, they are emitted as objects.
     * @param options - Options for configuring how atoms are output on the stream
     *
     * @see {@link Stream#serialize} if the stream values should be serialized to json
     * @group Consumption
     */
    toReadable(kind: "raw" | "object", options?: { single?: boolean; atoms?: boolean }): Readable;

    /**
     * Produce a readable node stream with the raw values from the stream.
     *
     * @param options.single - Whether to emit only the first atom
     *
     * @see {@link Stream#serialize} if the stream values should be serialized to json
     * @group Consumption
     */
    toReadable(kind: "raw", options?: { single?: boolean }): Readable;

    /**
     * Produce a readable node stream with the values from the stream
     *
     * @param options.single - Whether to emit only the first atom
     * @param options.atoms - By default, only `ok` values are emitted, however enabling this
     * will emit all values.
     *
     * @see {@link Stream#serialize} if the stream values should be serialized to json
     * @group Consumption
     */
    toReadable(kind: "object", options?: { single?: boolean; atoms?: boolean }): Readable;

    toReadable(
        kind: "raw" | "object",
        options: { single?: boolean; atoms?: boolean } = {},
    ): Readable {
        // Set up a new readable stream that does nothing
        const s = new Readable({
            read() {},
            objectMode: kind === "object",
        });

        // Spin off asynchronously so that the stream can be immediately returned
        (async () => {
            let sentItems = 0;

            for await (const atom of this) {
                // Determine whether non-ok values should be filtered out
                if (options?.atoms !== true && !isOk(atom)) {
                    continue;
                }

                // Monitor for multiple values being sent when only one is desired
                if (sentItems > 0 && options?.single) {
                    console.warn(
                        "indicated that stream would emit a single value, however multiple were emitted (ignoring)",
                    );
                    break;
                }

                // monitor for non raw values when not using object mode
                if (
                    kind === "raw" &&
                    !(typeof atom.value === "string" || atom.value instanceof Buffer)
                ) {
                    s.emit(
                        "error",
                        new Error(
                            `Stream indicated it would emit raw values but emitted a '${typeof atom.value}' object`,
                        ),
                    );
                    break;
                }

                // Emit atom or atom value
                s.push(options?.atoms ? atom : atom.value);
                sentItems += 1;
            }

            // End the stream
            s.push(null);
        })();

        return s;
    }
}
