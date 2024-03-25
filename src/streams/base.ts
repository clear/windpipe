import { ok } from "./atom";
import { Stream } from ".";
import { Readable } from "stream";

export class StreamBase {
    protected stream: Readable;

    constructor(stream: Readable) {
        this.stream = stream;
    }

    /**
     * Create a stream from some kind of stream-like value. This can be an iterable, a promise that
     * resolves to some value, or even another readable stream.
     *
     * @group Stream Creation
     */
    static from<T, E>(value: Promise<T> | Iterator<T> | AsyncIterator<T> | Iterable<T> | AsyncIterable<T>): Stream<T, E> {
        if (value instanceof Promise) {
            // Likely a promise
            return StreamBase.fromPromise(value);
        }

        if ("next" in value && typeof value.next === "function") {
            // Likely an iterator
            return StreamBase.fromIterator(value);
        }

        if (Symbol.iterator in value || Symbol.asyncIterator in value) {
            // Likely an iterable
            return StreamBase.fromIterable(value);
        }

        throw new TypeError("expected a promise, (async) iterator, or (async) iterable");
    }

    /**
     * Create a stream from a promise. The promise will be `await`ed, and the resulting value only
     * ever emitted once.
     *
     * @param promise - The promise to create the stream from.
     *
     * @group Stream Creation
     */
    static fromPromise<T, E>(promise: Promise<T>): Stream<T, E> {
        let awaited = false;

        return Stream.fromNext(async () => {
            if (!awaited) {
                awaited = true;

                const value = await promise;
                return ok(value);
            } else {
                return null;
            }
        });
    }

    /**
     * Create a stream from an iterator.
     *
     * @param iterator - The iterator that will produce values, which may be an async iterator.
     *
     * @group Stream Creation
     */
    static fromIterator<T, E>(iterator: Iterator<T> | AsyncIterator<T>): Stream<T, E> {
        return Stream.fromNext(async () => {
            const result = iterator.next();
            const { value, done } = result instanceof Promise
                ? (await result)
                : result;

            if (done) {
                return null;
            } else {
                return ok(value);
            }
        });
    }

    /**
     * Create a stream from an iterable.
     *
     * @param iterable - The iterable that will produce an iterator, which may be an async
     * iterator.
     *
     * @group Stream Creation
     */
    static fromIterable<T, E>(iterable: Iterable<T> | AsyncIterable<T>): Stream<T, E> {
        if (Symbol.iterator in iterable) {
            return StreamBase.fromIterator(iterable[Symbol.iterator]());
        } else {
            return StreamBase.fromIterator(iterable[Symbol.asyncIterator]());
        }
    }
}
