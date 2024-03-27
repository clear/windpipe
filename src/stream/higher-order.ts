import type { Stream } from ".";
import { isOk, type MaybeAtom } from "../atom";
import { handler, type MaybePromise } from "../handler";
import { StreamTransforms } from "./transforms";

export class HigherOrderStream<T, E> extends StreamTransforms<T, E> {
    /**
     * Map over each value in the stream, produce a stream from it, and flatten all the value
     * streams together
     *
     * @group Higher Order
     */
    flatMap<U>(cb: (value: T) => MaybePromise<MaybeAtom<Stream<U, E>, E>>): Stream<U, E> {
        const trace = this.trace("flatMap");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                // Emit any non-ok values back onto the stream
                if (!isOk(atom)) {
                    yield atom;
                    continue;
                }

                // Create the new stream
                const streamAtom = await handler(() => cb(atom.value), trace);

                // If the returned atom isn't ok, emit it back onto the stream
                if (!isOk(streamAtom)) {
                    yield streamAtom;
                    continue;
                }

                // Emit the generator of the new stream
                yield* streamAtom.value;
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
