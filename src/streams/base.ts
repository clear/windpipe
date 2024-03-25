import { ok, type Atom, is_ok } from "./atom";
import { Stream } from ".";
import { Readable, Writable } from "stream";

export class StreamBase<T, E> {
    protected stream: Readable;

    constructor(stream: Readable) {
        this.stream = stream;
    }

    /**
     * Create a stream from some kind of stream-like value. This can be an iterable, a promise that
     * resolves to some value, or even another readable stream.
     *
     * @group Creation
     */
    static from<T, E>(value: Promise<T> | Iterator<T> | AsyncIterator<T> | Iterable<T> | AsyncIterable<T> | (() => Promise<Atom<T, E>>)): Stream<T, E> {
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

        if (typeof value === "function") {
            // Likely a `next` function
            return StreamBase.fromNext(value);
        }

        throw new TypeError("expected a promise, (async) iterator, or (async) iterable");
    }

    /**
     * Create a stream from a promise. The promise will be `await`ed, and the resulting value only
     * ever emitted once.
     *
     * @param promise - The promise to create the stream from.
     *
     * @group Creation
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
     * @group Creation
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
     * @group Creation
     */
    static fromIterable<T, E>(iterable: Iterable<T> | AsyncIterable<T>): Stream<T, E> {
        if (Symbol.iterator in iterable) {
            return StreamBase.fromIterator(iterable[Symbol.iterator]());
        } else {
            return StreamBase.fromIterator(iterable[Symbol.asyncIterator]());
        }
    }

    /**
     * Create a new stream with the provided atom producer.
     *
     * @param next - A callback method to produce the next atom. If no atom is available, then
     * `null` must be returned.
     *
     * @group Creation
     */
    static fromNext<T, E>(next: () => Promise<Atom<T, E> | null>): Stream<T, E> {
        return new Stream(new Readable({
            objectMode: true,
            async read() {
                this.push(await next());
            },
        }));
    }

    /**
     * Create a stream and corresponding writable Node stream, where any writes to the writable
     * Node stream will be emitted on the returned stream.
     */
    static writable<T, E>(): { stream: Stream<T, E>, writable: Writable } {
        type Semaphore<T> = Promise<T> & { resolve: (value: T) => void };
        function semaphore<T>(): Semaphore<T> {
            let resolve: (value: T) => void;

            const promise: Partial<Semaphore<T>> = new Promise((done) => {
                resolve = done;
            });

            promise.resolve = (value) => resolve(value);

            return promise as Semaphore<T>;
        }

        let nextValue = semaphore<Atom<T, E> | null>();
        let valueRead = semaphore<void>();

        // The writable stream that will receive the transformed value.
        const writable = new Writable({
            objectMode: true,
            async write(value, _encoding, callback) {
                // Emit the next value
                nextValue.resolve(value);

                // Wait for the value to be emitted before allowing further writes
                await valueRead;

                callback();
            },
            async final(callback) {
                // Emit a `null` to close the stream
                nextValue.resolve(null);

                // Wait for the read before continuing to close stream
                await valueRead;

                callback();
            }
        });

        return {
            stream: Stream.fromNext(async () => {
                // Get the next value
                const value = await nextValue;

                // Copy semaphore for marking a value as successfully read
                const oldValueRead = valueRead;

                // Reset semaphores for the next usage
                nextValue = semaphore();
                valueRead = semaphore();

                // Mark semaphore for successful read
                oldValueRead.resolve();

                // Emit the actual value
                return value;
            }),
            writable,
        };
    }

    /**
     * Create an iterator that will emit each atom in the stream.
     *
     * @group Consumption
     */
    [Symbol.asyncIterator](): AsyncIterator<Atom<T, E>> {
        return this.stream[Symbol.asyncIterator]();
    }

    /**
     * Create an async iterator that will emit each value in the stream.
     *
     * @group Consumption
     */
    values(): AsyncIterator<T> {
        const it = this[Symbol.asyncIterator]();

        return {
             async next() {
                const { value, done } = await it.next();

                if (done) {
                    return { value, done: true };
                } else if (is_ok(value)) {
                    return { value: value.value };
                } else {
                    return await this.next();
                }
            }
        }
    }
}
