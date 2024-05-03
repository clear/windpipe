import { Stream } from ".";
import { isError, isOk, type Atom, isUnknown } from "../atom";
import { run } from "../handler";
import { type CallbackOrStream, type MaybePromise, exhaust } from "../util";
import { StreamTransforms } from "./transforms";

function accept<T>(value: T): { accept: T } {
    return { accept: value };
}

function reject<T>(value: T): { reject: T } {
    return { reject: value };
}

type FilterResult<A, R> = { accept: A } | { reject: R };

export class HigherOrderStream<T, E> extends StreamTransforms<T, E> {
    /**
     * Base implementation of `flat*` operations. In general, all of these methods will filter over
     * the type of atom, run some stream-producing callback with it, and then produce a new
     * generator to expand into the stream.
     *
     * @template A - The accepted type from the filter. Allows for type narrowing from `Atom<T, E>`
     * into `AtomOk<T>`, etc.
     * @template U - The `ok` type of the produced stream.
     * @template F - The `error` type of the produced stream.
     * @template CT - The `ok` type of the stream produced from the callback.
     * @template CE - The `error` type of the stream produced from the callback.
     */
    private flatOp<A, U, F, CT, CE>(
        filter: (atom: Atom<T, E>) => FilterResult<A, Atom<U, F>>,
        cb: (atom: A) => MaybePromise<Stream<CT, CE>>,
        process: (atom: Atom<T, E>, stream: Stream<CT, CE>) => AsyncGenerator<Atom<U, F>>,
    ): Stream<U, F> {
        const trace = this.trace("flatOp");

        return this.consume(async function*(it) {
            for await (const atom of it) {
                const result = filter(atom);

                if ("reject" in result) {
                    yield result.reject;
                    continue;
                }

                // Run the flat map handler
                const streamAtom = await run(() => cb(result.accept), trace);

                // If an error was emitted whilst initialising the new stream, return it
                if (!isOk(streamAtom)) {
                    yield streamAtom;
                    continue;
                }

                // Otherwise, consume the iterator
                yield* process(atom, streamAtom.value);
            }
        });
    }

    /**
     * Internal helper for implementing the other `flatMap` methods.
     */
    private flatMapAtom<A, U, F>(
        filter: (atom: Atom<T, E>) => FilterResult<A, Atom<U, F>>,
        cb: (atom: A) => MaybePromise<Stream<U, F>>,
    ): Stream<U, F> {
        this.trace("flatMapAll");

        return this.flatOp(filter, cb, async function*(_atom, stream) {
            yield* stream;
        });
    }

    /**
     * Map over each value in the stream, produce a stream from it, and flatten all the value
     * streams together
     *
     * @group Higher Order
     */
    flatMap<U>(cb: (value: T) => MaybePromise<Stream<U, E>>): Stream<U, E> {
        this.trace("flatMap");

        return this.flatMapAtom(
            (atom) => (isOk(atom) ? accept(atom) : reject(atom)),
            (atom) => {
                return cb(atom.value);
            },
        );
    }

    /**
     * Map over each error in the stream, produce a stream from it, and flatten all the value
     * streams together.
     *
     * @group Higher Order
     */
    flatMapError<F>(cb: (value: E) => MaybePromise<Stream<T, F>>): Stream<T, F> {
        this.trace("flatMapError");

        return this.flatMapAtom(
            (atom) => (isError(atom) ? accept(atom) : reject(atom)),
            (atom) => {
                return cb(atom.value);
            },
        );
    }

    /**
     * Maps over each unknown error in the stream, producing a new stream from it, and flatten all
     * the value streams together.
     *
     * @group Higher Order
     */
    flatMapUnknown(
        cb: (value: unknown, trace: string[]) => MaybePromise<Stream<T, E>>,
    ): Stream<T, E> {
        const trace = this.trace("flatMapUnknown");

        return this.flatMapAtom(
            (atom) => (isUnknown(atom) ? accept(atom) : reject(atom)),
            (atom) => {
                return cb(atom.value, trace);
            },
        );
    }

    /**
     * Produce a new stream from the stream that has any nested streams flattened
     *
     * @note Any atoms that are not nested streams are emitted as-is
     * @group Higher Order
     */
    flatten(): T extends Stream<infer U, E> ? Stream<U, E> : Stream<T, E> {
        this.trace("flatten");

        return this.consume(async function*(it) {
            for await (const atom of it) {
                // Yield errors/unkowns directly
                if (!isOk(atom)) {
                    yield atom;
                    continue;
                }

                // Yield each atom within nested streams
                if (atom.value instanceof Stream) {
                    yield* atom.value;
                } else {
                    yield atom;
                }
            }
        }) as T extends Stream<infer U, E> ? Stream<U, E> : Stream<T, E>;
    }

    /**
     * Base implementation of the `flatTap` operations.
     */
    private flatTapAtom<A>(
        filter: (atom: Atom<T, E>) => FilterResult<A, Atom<T, E>>,
        cb: (atom: A) => MaybePromise<Stream<unknown, unknown>>,
    ): Stream<T, E> {
        this.trace("flatTapAtom");

        return this.flatOp(filter, cb, async function*(atom, stream) {
            await exhaust(stream);

            yield atom;
        });
    }

    /**
     * Produce a stream for each value in the stream. The resulting stream will be emptied,
     * however the resulting values will just be dropped. This is analogous to an asynchronous
     * side effect.
     *
     * @group Higher Order
     */
    flatTap(cb: (value: T) => MaybePromise<Stream<unknown, unknown>>): Stream<T, E> {
        this.trace("flatTap");

        return this.flatTapAtom(
            (atom) => (isOk(atom) ? accept(atom) : reject(atom)),
            (atom) => cb(atom.value),
        );
    }

    /**
     * Emit items from provided stream if this stream is completely empty.
     *
     * @note If there are any errors (known or unknown) on the stream, then the new stream won't be
     * consumed.
     *
     * @group Higher Order
     */
    otherwise(cbOrStream: CallbackOrStream<T, E>): Stream<T, E> {
        return this.consume(async function*(it) {
            // Count the items being emitted from the iterator
            let count = 0;
            for await (const atom of it) {
                count += 1;
                yield atom;
            }

            // If nothing was emitted, then create the stream and emit it
            if (count === 0) {
                if (typeof cbOrStream === "function") {
                    yield* cbOrStream();
                } else {
                    yield* cbOrStream;
                }
            }
        });
    }

    /**
     * Consume the entire stream, and completely replace it with a new stream. This will remove
     * any errors currently on the stream (both known and unknown).
     *
     * Equivalent to:
     *
     * ```
     * stream
     *   .filter(() => false)
     *   .otherwise(newStream);
     * ```
     * `
     *
     * @group Higher Order
     */
    replaceWith<U, F>(cbOrStream: CallbackOrStream<U, F>): Stream<U, F> {
        return this.consume(async function*(it) {
            // Consume all the items in the stream
            await exhaust(it);

            // Replace with the user stream
            if (typeof cbOrStream === "function") {
                yield* cbOrStream();
            } else {
                yield* cbOrStream;
            }
        });
    }
}
