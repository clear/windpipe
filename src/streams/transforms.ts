import { pipeline } from "stream/promises";
import { Stream } from ".";
import { StreamBase } from "./base";
import { is_ok, is_unknown, type MaybeAtom, type Atom, normalise, is_err } from "./atom";

export class StreamTransforms<T, E> extends StreamBase<T, E> {
    /**
     * Consume the stream atoms, emitting new atoms from the generator.
     *
     * @group Transform
     */
    consume<U, F>(generator: (it: AsyncIterable<Atom<T, E>>) => AsyncGenerator<Atom<U, F>>): Stream<U, F> {
        const { stream, writable } = Stream.writable<U, F>();

        pipeline(
            this.stream,
            generator,
            writable,
        );

        return stream;
    }

    /**
     * Map over each value in the stream.
     *
     * @group Transform
     */
    map<U>(cb: (value: T) => MaybeAtom<U, E>): Stream<U, E> {
        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (is_ok(atom)) {
                    yield normalise(cb(atom.value));
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
    mapError<F>(cb: (error: E) => MaybeAtom<T, F>): Stream<T, F> {
        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (is_err(atom)) {
                    yield normalise(cb(atom.value));
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
    mapUnknown(cb: (error: unknown) => MaybeAtom<T, E>): Stream<T, E> {
        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (is_unknown(atom)) {
                    yield normalise(cb(atom.value));
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
    filter(condition: (value: T) => boolean): Stream<T, E> {
        return this.consume(async function* (it) {
            for await (const atom of it) {
                if ((is_ok(atom) && condition(atom.value as T)) || !is_ok(atom)) {
                    // Emit any value that passes the condition, or non-values
                    yield atom;
                }
            }
        });
    }
}
