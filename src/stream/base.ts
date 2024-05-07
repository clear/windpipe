import { normalise, type Atom, type MaybeAtom, error, unknown } from "../atom";
import { Stream } from ".";
import { Readable, Writable } from "stream";
import { createNodeCallback } from "../util";

/**
 * Marker for the end of a stream.
 */
export const StreamEnd = Symbol.for("STREAM_END");

/**
 * Unique type to represent the stream end marker.
 */
export type StreamEnd = typeof StreamEnd;

export class StreamBase {
    protected stream: Readable;
    protected stackTrace: string[] = [];
    protected traceComplete: boolean = false;

    constructor(stream: Readable) {
        this.stream = stream;
    }

    /**
     * Add a layer to the trace object. Returns a copy of the current trace.
     */
    protected trace(trace: string) {
        if (!this.traceComplete) {
            this.stackTrace.push(trace);
            this.traceComplete = true;
        }

        return this.getTrace();
    }

    /**
     * Capture the current trace. Creates a clone of the trace to prevent it being modified.
     */
    protected getTrace(): string[] {
        return [...this.stackTrace];
    }

    /**
     * Create a stream from some kind of stream-like value. This can be an iterable, a promise that
     * resolves to some value, or even another readable stream.
     *
     * @group Creation
     */
    static from<T, E>(
        value:
            | Promise<MaybeAtom<T, E>>
            | Iterator<MaybeAtom<T, E>>
            | AsyncIterator<MaybeAtom<T, E>>
            | Iterable<MaybeAtom<T, E>>
            | AsyncIterable<MaybeAtom<T, E>>
            | Array<MaybeAtom<T, E>>
            | (() => Promise<MaybeAtom<T, E>>),
    ): Stream<T, E> {
        if (Array.isArray(value)) {
            // Likely an array
            return StreamBase.fromArray(value);
        }

        if (value instanceof Promise) {
            // Likely a promise
            return StreamBase.fromPromise(value);
        }

        if (Symbol.iterator in value || Symbol.asyncIterator in value) {
            // Likely an iterable
            return StreamBase.fromIterable(value);
        }

        if ("next" in value && typeof value.next === "function") {
            // Likely an iterator
            return StreamBase.fromIterator(value);
        }

        if (typeof value === "function") {
            // Likely a `next` function
            return StreamBase.fromNext(value);
        }

        throw new TypeError("expected a promise, (async) iterator, or (async) iterable");
    }

    /**
     * Create a stream from a node-style callback. A node-compatible callback function will be
     * passed as the first parameter to the callback of this function.
     *
     * The first parameter provided to the callback (the `error`) will be emitted as an `Error`
     * atom, whilst the second parameter (the `value`) will be emitted as an `Ok` atom.
     *
     * @example
     * $.fromCallback((next) => someAsyncMethod(paramA, paramB, next));
     *
     * @group Creation
     */
    static fromCallback<T, E>(cb: (next: (error: E, value: T) => unknown) => void): Stream<T, E> {
        // Set up a next function
        const [promise, next] = createNodeCallback<T, E>();

        // Run the callback
        cb(next);

        return StreamBase.fromPromise(promise);
    }

    /**
     * Create a stream from a promise. The promise will be `await`ed, and the resulting value only
     * ever emitted once.
     *
     * @param promise - The promise to create the stream from.
     *
     * @group Creation
     */
    static fromPromise<T, E>(promise: Promise<MaybeAtom<T, E>>): Stream<T, E> {
        let awaited = false;

        return Stream.fromNext(async () => {
            if (!awaited) {
                awaited = true;

                return normalise(await promise);
            } else {
                return StreamEnd;
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
    static fromIterator<T, E>(
        iterator: Iterator<MaybeAtom<T, E>> | AsyncIterator<MaybeAtom<T, E>>,
    ): Stream<T, E> {
        return Stream.fromNext(async () => {
            const result = iterator.next();
            const { value, done } = result instanceof Promise ? await result : result;

            if (done) {
                return StreamEnd;
            } else {
                return normalise(value);
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
    static fromIterable<T, E>(
        iterable: Iterable<MaybeAtom<T, E>> | AsyncIterable<MaybeAtom<T, E>>,
    ): Stream<T, E> {
        if (Symbol.iterator in iterable) {
            return StreamBase.fromIterator(iterable[Symbol.iterator]());
        } else {
            return StreamBase.fromIterator(iterable[Symbol.asyncIterator]());
        }
    }

    /**
     * Create a stream from an array.
     *
     * @param array - The array that values will be emitted from.
     *
     * @group Creation
     */
    static fromArray<T, E>(array: MaybeAtom<T, E>[]): Stream<T, E> {
        return Stream.fromNext(async () => {
            return array.shift() ?? StreamEnd;
        });
    }

    /**
     * Create a new stream with the provided atom producer.
     *
     * @param next - A callback method to produce the next atom. If no atom is available, then
     * `StreamEnd` must be returned.
     *
     * @group Creation
     */
    static fromNext<T, E>(next: () => Promise<MaybeAtom<T, E> | StreamEnd>): Stream<T, E> {
        return new Stream(
            new Readable({
                objectMode: true,
                async read() {
                    try {
                        const value = await next();

                        // Promise returned as normal
                        if (value === StreamEnd) {
                            this.push(null);
                        } else {
                            this.push(normalise(value));
                        }
                    } catch (e) {
                        // Promise was rejected, add as an unknown error
                        this.push(unknown(e, []));
                    }
                },
            }),
        );
    }

    /**
     * Create a new stream containing a single value. Unless an atom is provided, it will be
     * converted to an `ok` atom.
     *
     * @group Creation
     */
    static of<T, E>(value: MaybeAtom<T, E>): Stream<T, E> {
        let consumed = false;
        return Stream.fromNext(async () => {
            if (!consumed) {
                consumed = true;
                return value;
            } else {
                return StreamEnd;
            }
        });
    }

    /**
     * Create a new stream containing a single error atom.
     *
     * @group Creation
     */
    static ofError<T, E>(value: E): Stream<T, E> {
        return this.of(error(value));
    }

    /**
     * Create a new stream containing a single unknown atom.
     *
     * @group Creation
     */
    static ofUnknown<T, E>(value: unknown): Stream<T, E> {
        return this.of(unknown(value, []));
    }

    /**
     * Create a stream and corresponding writable Node stream, where any writes to the writable
     * Node stream will be emitted on the returned stream.
     */
    static writable<T, E>(): { stream: Stream<T, E>; writable: Writable } {
        const buffer: (Atom<T, E> | StreamEnd)[] = [];
        const queue: ((value: Atom<T, E> | StreamEnd) => void)[] = [];

        function enqueue(value: Atom<T, E> | StreamEnd) {
            if (queue.length > 0) {
                queue.shift()?.(value);
            } else {
                buffer.push(value);
            }
        }

        function dequeue(): Promise<Atom<T, E> | StreamEnd> {
            return new Promise((resolve) => {
                if (buffer.length > 0) {
                    resolve(buffer.shift() as Atom<T, E> | StreamEnd);
                } else {
                    queue.push(resolve);
                }
            });
        }

        // The writable stream that will receive the transformed value.
        const writable = new Writable({
            objectMode: true,
            async write(value, _encoding, callback) {
                enqueue(value);

                callback();
            },
            async final(callback) {
                // Emit a `StreamEnd` to close the stream
                enqueue(StreamEnd);

                callback();
            },
        });

        return {
            stream: Stream.fromNext(dequeue),
            writable,
        };
    }
}
