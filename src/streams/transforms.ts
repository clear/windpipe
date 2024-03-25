import { pipeline } from "stream/promises";
import { Stream } from ".";
import { StreamBase } from "./base";
import { is_ok, ok } from "./atom";

export class StreamTransforms<T, E> extends StreamBase {
    /**
     * Map over each value in the array.
     *
     * @group Transform
     */
    map<U>(cb: (value: T) => U): Stream<T, E> {
        const { stream, writable } = Stream.writable<T, E>();

        pipeline(
            this.stream,
            async function* (s) {
                for await (const v of s) {
                    if (is_ok(v)) {
                        // Map over the value
                        yield ok(cb(v.value as T));
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
}
