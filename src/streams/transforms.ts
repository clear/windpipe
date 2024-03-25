import { pipeline } from "stream/promises";
import { Stream } from ".";
import { StreamBase } from "./base";
import { is_ok, type MaybeAtom, type Atom, normalise } from "./atom";

export class StreamTransforms<T, E> extends StreamBase<T, E> {
    /**
     * Map over each value in the array.
     *
     * @group Transform
     */
    map<U>(cb: (value: T) => MaybeAtom<U, E>): Stream<U, E> {
        const { stream, writable } = Stream.writable<U, E>();

        pipeline(
            this.stream,
            async function* (s): AsyncGenerator<Atom<U, E>> {
                for await (const v of s as AsyncIterable<Atom<T, E>>) {
                    if (is_ok(v)) {
                        // Map over the value
                        yield normalise(cb(v.value as T));
                    } else {
                        // Re-emit the non-value
                        yield v;
                    }
                }
            },
            writable,
        );

        return stream;
    }

    /**
     * Filter over each value in the stream.
     *
     * @group Transform
     */
    filter(condition: (value: T) => boolean): Stream<T, E> {
        const { stream, writable } = Stream.writable<T, E>();

        pipeline(
            this.stream,
            async function* (s): AsyncGenerator<Atom<T, E>> {
                for await (const v of s as AsyncIterable<Atom<T, E>>) {
                    if ((is_ok(v) && condition(v.value as T)) || !is_ok(v)) {
                        // Emit any value that passes the condition, or non-values
                        yield v;
                    }
                }
            },
            writable,
        );

        return stream;
    }
}
