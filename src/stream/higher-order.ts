import type { Stream } from ".";
import { isError, isOk, type Atom, type MaybeAtom, isUnknown } from "../atom";
import { handler } from "../handler";
import type { CallbackOrStream, MaybePromise } from "../util";
import { StreamTransforms } from "./transforms";

type FlatMapResult<T, E> = { atom: Atom<T, E> } | { stream: Promise<Atom<Stream<T, E>, E>> };

export class HigherOrderStream<T, E> extends StreamTransforms<T, E> {
    /**
     * Map over each value in the stream, produce a stream from it, and flatten all the value
     * streams together
     *
     * @group Higher Order
     */
    flatMap<U>(cb: (value: T) => MaybePromise<MaybeAtom<Stream<U, E>, E>>): Stream<U, E> {
        const trace = this.trace("flatMap");

        return this.flatMapAtom((atom) => {
            if (isOk(atom)) {
                return { stream: handler(() => cb(atom.value), trace) };
            } else {
                return { atom };
            }
        });
    }

    /**
     * Map over each error in the stream, produce a stream from it, and flatten all the value
     * streams together.
     *
     * @group Higher Order
     */
    flatMapError<F>(cb: (value: E) => MaybePromise<MaybeAtom<Stream<T, F>, F>>): Stream<T, F> {
        const trace = this.trace("flatMapError");

        return this.flatMapAtom((atom) => {
            if (isError(atom)) {
                return { stream: handler(() => cb(atom.value), trace) };
            } else {
                return { atom };
            }
        });
    }

    /**
     * Maps over each unknown error in the stream, producing a new stream from it, and flatten all
     * the value streams together.
     *
     * @group Higher Order
     */
    flatMapUnknown(
        cb: (value: unknown, trace: string[]) => MaybePromise<MaybeAtom<Stream<T, E>, E>>,
    ): Stream<T, E> {
        const trace = this.trace("flatMapUnknown");

        return this.flatMapAtom((atom) => {
            if (isUnknown(atom)) {
                return { stream: handler(() => cb(atom.value, atom.trace), trace) };
            } else {
                return { atom };
            }
        });
    }

    /**
     * Internal helper for implementing the other `flatMap` methods.
     *
     * The provided callback *must* not be able to throw. It is expected that any user code run
     * within is properly handled.
     */
    private flatMapAtom<U, F>(cb: (atom: Atom<T, E>) => FlatMapResult<U, F>): Stream<U, F> {
        return this.consume(async function* (it) {
            for await (const atom of it) {
                // Create the new stream
                const atomOrStream = cb(atom);

                if ("atom" in atomOrStream) {
                    yield atomOrStream.atom;
                    continue;
                }

                const stream = await atomOrStream.stream;

                // If the returned atom isn't ok, emit it back onto the stream
                if (!isOk(stream)) {
                    yield stream;
                    continue;
                }

                // Emit the generator of the new stream
                yield* stream.value;
            }
        });
    }

    /**
     * Produce a stream for each value in the stream. The resulting stream will be emptied,
     * however the resulting values will just be dropped. This is analogous to an asynchronous
     * side effect.
     *
     * @group Higher Order
     */
    flatTap(cb: (value: T) => MaybePromise<MaybeAtom<Stream<T, E>, E>>): Stream<T, E> {
        const trace = this.trace("flatTap");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (!isOk(atom)) {
                    yield atom;
                    continue;
                }

                const streamAtom = await handler(() => cb(atom.value), trace);

                if (isOk(streamAtom)) {
                    // Consume the resulting stream, and emit the original atom
                    for await (const _ of streamAtom.value) {
                        // eslint-ignore no-empty
                    }

                    yield atom;
                } else {
                    yield streamAtom;
                }
            }
        });
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
        return this.consume(async function* (it) {
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
        return this.consume(async function* (it) {
            // Consume all the items in the stream
            for await (const _atom of it) {
                // eslint-disable-next-line no-empty
            }

            // Replace with the user stream
            if (typeof cbOrStream === "function") {
                yield* cbOrStream();
            } else {
                yield* cbOrStream;
            }
        });
    }
}
