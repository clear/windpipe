import type { Stream } from ".";
import { isError, isOk, type Atom, type MaybeAtom, isUnknown } from "../atom";
import { handler, type MaybePromise } from "../handler";
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
    flatMapUnknown(cb: (value: unknown, trace: string[]) => MaybePromise<MaybeAtom<Stream<T, E>, E>>): Stream<T, E> {
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
     * Emit items from provided stream if this stream is completely empty.
     *
     * @note If there are any errors (known or unknown) on the stream, then the new stream won't be
     * consumed.
     *
     * @group Higher Order
     */
    otherwise(cbOrStream: (() => Stream<T, E>) | Stream<T, E>): Stream<T, E> {
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
}
