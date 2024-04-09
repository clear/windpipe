import { pipeline } from "stream/promises";
import { Stream } from ".";
import { isOk, isUnknown, type MaybeAtom, type Atom, isError, unknown } from "../atom";
import { handler, type MaybePromise } from "../handler";
import { StreamConsumption } from "./consumption";
import { Readable, Writable } from "stream";

export class StreamTransforms<T, E> extends StreamConsumption<T, E> {
    /**
     * Consume the stream atoms, emitting new atoms from the generator.
     *
     * @group Transform
     */
    consume<U, F>(generator: (it: AsyncIterable<Atom<T, E>>) => AsyncGenerator<Atom<U, F>>): Stream<U, F> {
        const trace = this.trace("consume");

        const stream = new Stream<U, F>(Readable.from(generator(this.stream)));
        stream.stackTrace = trace

        return stream;
    }

    /**
     * Map over each value in the stream.
     *
     * @group Transform
     */
    map<U>(cb: (value: T) => MaybePromise<MaybeAtom<U, E>>): Stream<U, E> {
        const trace = this.trace("map");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (isOk(atom)) {
                    yield await handler(() => cb(atom.value), trace);
                } else {
                    yield atom;
                }
            }
        });
    }

    /**
     * Map over each error in the stream.
     *
     * @group Transform
     */
    mapError<F>(cb: (error: E) => MaybePromise<MaybeAtom<T, F>>): Stream<T, F> {
        const trace = this.trace("mapError");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (isError(atom)) {
                    yield await handler(
                        () => cb(atom.value),
                        trace,
                    );
                } else {
                    yield atom;
                }
            }
        });
    }

    /**
     * Map over each unknown in the stream.
     *
     * @group Transform
     */
    mapUnknown(cb: (error: unknown) => MaybePromise<MaybeAtom<T, E>>): Stream<T, E> {
        const trace = this.trace("mapUnknown");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (isUnknown(atom)) {
                    yield await handler(
                        () => cb(atom.value),
                        trace,
                    );
                } else {
                    yield atom;
                }
            }
        });
    }

    /**
     * Filter over each value in the stream.
     *
     * @group Transform
     */
    filter(condition: (value: T) => MaybePromise<boolean>): Stream<T, E> {
        const trace = this.trace("filter");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                // Re-emit any existing errors onto the stream
                if (!isOk(atom)) {
                    yield atom;
                }

                // Run the filter condition
                const filter = await handler(
                    () => condition(atom.value as T),
                    trace,
                );

                if (isOk(filter) && filter.value) {
                    yield atom;
                } else if (!isOk(filter)) {
                    // Non-value returned from the filter
                    const error: Error & { detail?: any } = new Error(
                        "non-ok value returned from filter condition"
                    );
                    error.detail = filter;
                    yield unknown(error, trace);
                }
            }
        });
    }
}
