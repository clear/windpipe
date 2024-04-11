import { Stream } from ".";
import { isOk, isUnknown, type MaybeAtom, type Atom, isError, unknown } from "../atom";
import { handler, type MaybePromise } from "../handler";
import { StreamConsumption } from "./consumption";
import { Readable } from "stream";
import util from "node:util";

type Truthy<T> = NonNullable<Exclude<T, false | "">>;

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
     * Run a callback for each value in the stream, ideal for side effects on stream items.
     *
     * @group Transform
     */
    tap(cb: (value: T) => unknown): Stream<T, E> {
        this.trace("tap");

        return this.map((value) => {
            try {
                cb(value);
            } catch (e) {
                console.error("Error thrown in tap operation:", e);
            }

            return value;
        });
    }

    /**
     * Inspect every atom that is emitted through the stream.
     *
     * @group Transform
     */
    inspect(): Stream<T, E> {
        this.trace("inspect");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                console.log(util.inspect(atom, false, Infinity, true));

                yield atom;
            }
        });
    }

    /**
     * Filter over each value in the stream.
     *
     * @group Transform
     */
    filter(condition: (value: T) => MaybePromise<any>): Stream<T, E> {
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

    /**
     * Remove falsey values from the stream.
     *
     * This is equivalent to doing `.filter((value) => value)`.
     *
     * @group Transform
     */
    compact(): Stream<Truthy<T>, E> {
        this.trace("compact");

        return this.filter((value) => {
            if (value) {
                return true;
            } else {
                return false;
            }
        }) as Stream<Truthy<T>, E>;
    }

    /**
     * Return a stream containing the first `n` values. If `options.atoms` is `true`, then the
     * first `n` atoms rather than values will be emitted.
     *
     * @param options.atoms - If enabled, first `n` atoms will be counted, otherwise values.
     *
     * @group Transform
     */
    take(n: number, options?: { atoms?: boolean }): Stream<T, E> {
        this.trace("take");

        return this.consume(async function* (it) {
            let i = 0;

            for await (const atom of it) {
                if (i >= n) {
                    break;
                }

                if (isOk(atom) || options?.atoms === true) {
                    yield atom;
                }

                i++;
            }
        });
    }
}
