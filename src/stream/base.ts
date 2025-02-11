import { normalise, type Atom, type MaybeAtom, error, exception } from "../atom";
import { Stream } from ".";
import { Readable, Writable } from "stream";
import { createNodeCallback, newSignal, type NodeCallback } from "../util";

/**
 * Unique type to represent the stream end marker.
 */
export type StreamEnd = typeof StreamBase.StreamEnd;

export class StreamBase {
    protected stream: Readable;
    protected stackTrace: string[] = [];
    protected traceComplete: boolean = false;

    /**
     * Marker for the end of a stream.
     */
    static StreamEnd = Symbol.for("STREAM_END");

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
    static from<T, E = never>(
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
    static fromCallback<T, E = never>(cb: (next: NodeCallback<T, E>) => void): Stream<T, E> {
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
    static fromPromise<T, E = never>(promise: Promise<MaybeAtom<T, E>>): Stream<T, E> {
        let awaited = false;

        return Stream.fromNext(async () => {
            if (!awaited) {
                awaited = true;

                return normalise(await promise);
            } else {
                return StreamBase.StreamEnd;
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
    static fromIterator<T, E = never>(
        iterator: Iterator<MaybeAtom<T, E>> | AsyncIterator<MaybeAtom<T, E>>,
    ): Stream<T, E> {
        return Stream.fromNext(async () => {
            const result = iterator.next();
            const { value, done } = result instanceof Promise ? await result : result;

            if (done) {
                return StreamBase.StreamEnd;
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
    static fromIterable<T, E = never>(
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
     * @note The array will be shallow cloned internally, so that the original array won't be
     * impacted.
     *
     * @param array - The array that values will be emitted from.
     *
     * @group Creation
     */
    static fromArray<T, E = never>(array: MaybeAtom<T, E>[]): Stream<T, E> {
        // Clone the array so that shifting elements doesn't impact the original array.
        array = [...array];

        return Stream.fromNext(async () => {
            if (array.length === 0) return StreamBase.StreamEnd;
            return array.shift()!;
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
    static fromNext<T, E = never>(next: () => Promise<MaybeAtom<T, E> | StreamEnd>): Stream<T, E> {
        return new Stream(
            new Readable({
                objectMode: true,
                async read() {
                    try {
                        const value = await next();

                        // Promise returned as normal
                        if (value === StreamBase.StreamEnd) {
                            this.push(null);
                        } else {
                            // @ts-expect-error - The previous `if` statement doesn't cause TS to
                            // type-narrow out `symbol`
                            this.push(normalise(value));
                        }
                    } catch (e) {
                        // Promise was rejected, add as an exception
                        this.push(exception(e, []));
                    }
                },
            }),
        );
    }

    /**
     * Create a new stream, and use the provided `push` and `done` methods to add values to it, and
     * complete the stream.
     *
     * - `push`: Adds the provided value to the stream.
     * - `done`: Indicatest that the stream is done, meaning that any future calls to `push` or
     *   `done` will be ignored.
     *
     * @group Creation
     */
    static fromPusher<T, E = never>(): {
        stream: Stream<T, E>;
        push: (value: MaybeAtom<T, E>) => void;
        done: () => void;
    } {
        // Queue of atoms waiting to be pushed.
        const queue: MaybeAtom<T, E>[] = [];

        // Flag to indicate when the `done` method is called.
        let done = false;

        // Signal to indicate when some action has taken place.
        let signal = newSignal();

        async function next(retry = 10) {
            // If there's something waiting in the queue, immediately produce it.
            if (queue.length > 0) {
                return queue.shift()!;
            }

            // If the stream is complete, immediately return.
            if (done) {
                return Stream.StreamEnd;
            }

            // Prepare a new signal, and wait for it.
            signal = newSignal();
            await signal;

            // Protection incase something goes whack with the signal, shouldn't ever be
            // encountered.
            if (retry === 0) {
                console.warn("[windpipe] recursion limit hit whilst waiting for pushed value");

                return Stream.StreamEnd;
            }

            // Recurse and try again.
            return next(retry - 1);
        }

        return {
            stream: Stream.fromNext<T, E>(next),
            push: (value: MaybeAtom<T, E>) => {
                if (done) {
                    console.error("[windpipe] cannot push after stream is complete");
                    return;
                }

                queue.push(value);
                signal.done();
            },
            done: () => {
                done = true;
                signal.done();
            },
        };
    }

    /**
     * Create a new stream containing a single value. Unless an atom is provided, it will be
     * converted to an `ok` atom.
     *
     * @group Creation
     */
    static of<T, E = never>(value: MaybeAtom<T, E>): Stream<T, E> {
        let consumed = false;
        return Stream.fromNext(async () => {
            if (!consumed) {
                consumed = true;
                return value;
            } else {
                return StreamBase.StreamEnd;
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
     * Create a new stream containing a single exception atom.
     *
     * @group Creation
     */
    static ofException<T, E>(value: unknown): Stream<T, E> {
        return this.of(exception(value, []));
    }

    /**
     * @group Creation
     * @deprecated use `ofException` instead
     */
    static ofUnknown<T, E>(value: unknown): Stream<T, E> {
        return this.ofException(value);
    }

    /**
     * Create a stream and corresponding writable Node stream, where any writes to the writable
     * Node stream will be emitted on the returned stream.
     */
    static writable<T, E = never>(): { stream: Stream<T, E>; writable: Writable } {
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
                enqueue(StreamBase.StreamEnd);

                callback();
            },
        });

        return {
            stream: Stream.fromNext(dequeue),
            writable,
        };
    }
}
