import { wrap_async } from "./async";
import { type Atom, ok, err, unknown, end, is_ok, is_end, is_err } from "./atom";
import { IfBuilder, type Condition, type ConditionHandler } from "./if_builder";
import type { Callback, OptionalCallback } from "./types";
import { normalise, type Value } from "./value";

import { createReadStream } from "fs";
import { Readable } from "stream";

export * from "./atom";
export * from "./if_builder";
export * from "./value";

/**
 * Every call of this function should produce a new atom for the stream. It takes a callback
 * function as it's only parameter, which must be called with the stream atom upon completion. The
 * provided callback must only be called once, however the atom producer can be called multiple
 * times in order to produce more values.
 */
type AtomProducer<T, E> = Callback<Callback<Atom<T, E>>>;

/**
 * Consume a stream, value by value, pushing values onto a new stream.
 *
 * Consumer simply gets a `done` callback, which takes any items to push. This can be
 * called with undefined/empty array to trigger an automatic retry.
 *
 * @param value - Value being emitted in the stream.
 * @param done - Callback to be passed values to be pushed onto new stream
 */
type Consumer<T, E, U, F> = (value: Atom<T, E>, done: OptionalCallback<Array<Value<U, F>>>) => void;

const nop = () => {};

/**
 * Stream interface.
 *
 * @public
 */
export class Stream<T, E> {
    /**
     * Callback function that will produce the next stream atom.
     *
     * @internal
     */
    private atom_producer: AtomProducer<T, E>;

    /**
     * A reference to the stream where the last trace was taken. This is useful for ensuring that
     * traces aren't captured multiple times for a single operation, for instance when a method
     * calls another method function.
     *
     * @internal
     */
    private last_trace: Stream<any, any> | null = null;

    /**
     * Current trace for this stream, used for nice error messages.
     *
     * @internal
     */
    private trace: Array<string> = [];

    constructor(atom_producer: AtomProducer<T, E>) {
        this.atom_producer = atom_producer;
    }

    /**
     * Wrap another function with this one to catch any errors that are thrown, and emit them as
     * an `unknown` stream atom. This is particularly useful for running user functions which may
     * not properly handle errors.
     *
     * @internal
     */
    private proxy_user_function<U>(f: () => Value<U, E>): Atom<U, E> {
        try {
            return normalise(f());
        } catch (error) {
            return unknown(error, this.trace);
        };
    }

    /**
     * Create a new stream with a new atom producer, but retaining current tracing state.
     *
     * @internal
     */
    private clone_stream<U, F>(atom_producer: AtomProducer<U, F>): Stream<U, F> {
        const s = new Stream(atom_producer);

        s.last_trace = this.last_trace;
        s.trace = [...this.trace];

        return s;
    }

    /**
     * Insert a trace. The trace will only be updated if it has not been called on this instance
     * of the stream.
     *
     * @internal
     */
    private t(trace: string) {
        if (this.last_trace !== this) {
            this.last_trace = this;
            this.trace.push(trace);
        }
    }

    /**
     * Get the next atom in the stream, passing it to the provided callback upon resolution.
     */
    next(cb?: Callback<Atom<T, E>>): Promise<Atom<T, E>> {
        return wrap_async(cb, (done) => {
            let emitted = false;

            this.atom_producer((value) => {
                if (emitted) {
                    console.error("value emitted twice");
                } else {
                    emitted = true;
                    done(value);
                }
            });
        });
    }

    /**
     * @internal
     */
    consume<U, F>(consumer: Consumer<T, E, U, F>): Stream<U, F> {
        this.t("consume");

        let queue: Array<Atom<U, F>> = [];

        return this.clone_stream((provide_value) => {
            let value_provided = false;

            const emit_value = () => {
                if (queue.length > 0) {
                    // Value remains in queue, fetch it before continuing
                    value_provided = true;
                    return provide_value(queue.shift() as Atom<U, F>);
                } else {
                    feed_consumer();
                }
            }

            const feed_consumer = () => {
                // Make sure that queue has some values in it
                if (queue.length === 0) {
                    // Get the value from upstream
                    this.next((value) => {
                        // Pass it to the consumer
                        this.proxy_user_function(() => (
                            consumer(value, (values) => {
                                // Update the queue
                                if (values) {
                                    queue = queue.concat(values.map(normalise));
                                }

                                // Emit value
                                emit_value();
                            })
                        ));
                    });
                } else {
                    // There's a value in the queue, emit it without calling the consumer
                    emit_value();
                }
            };

            emit_value();
        });
    }

    /**
     * @internal
     */
    consume_values<U>(consumer: (value: T, done: Callback<Array<Value<U, E>>>) => void): Stream<U, E> {
        this.t("consume_values");

        return this.consume((value, done) => {
            if (is_ok(value)) {
                this.proxy_user_function(() => {
                    consumer(value.value, (values) => {
                        done(values.map(normalise));
                    });
                });
            } else {
                done([value]);
            }
        });
    }

    /**
     * @internal
     */
    push(value: T): Stream<T, E> {
        this.t("push");

        let pushed = false;
        return this.consume((next_value, done) => {
            if (is_end(next_value) && !pushed) {
                pushed = true;
                done([normalise(value), next_value]);
            } else {
                done([next_value]);
            }
        });
    }

    /**********
     * Transforms
     **********/
    /**
     * Map over each value in the stream, producing a new value.
     *
     * @group Transforms
     */
    map<U>(op: (value: T) => Value<U, E>): Stream<U, E> {
        this.t("map");

        return this.consume_values((value, done) => {
            const result = this.proxy_user_function(() => (
                op(value)
            ));

            done([result]);
        });
    }

    map_err<F>(op: (err: E) => F): Stream<T, F> {
        this.t("map_err");

        return this.consume((value, done) => {
            if (is_err(value)) {
                const result = op(value.value);

                done([err(result)]);
            } else {
                done([value]);
            }
        });
    }

    /**
     * For each value in the stream call the provided function, returning a stream of the original
     * values. This is useful for observing values in the stream without modifying them.
     *
     * @group Transforms
     */
    tap(op: (value: T) => void): Stream<T, E> {
        this.t("tap");

        return this.consume_values((value, done) => {
            this.proxy_user_function(() => {
                op(value);
            });

            done([ok(value)]);
        });
    }

    /**
     * Any time a value is emitted from upstream, delay it by some amount of milliseconds.
     *
     * @group Transforms
     */
    delay(ms: number): Stream<T, E> {
        this.t("delay");

        return this.consume((value, done) => {
            setTimeout(() => {
                done([value]);
            }, ms);
        });
    }

    /**********
     * Control flow
     **********/
    /**
     * Creates a new `IfBuilder` that will operate over the stream. Allows for defining conditions
     * and a callback to run if the condition passes, which should produce a new stream. This is a
     * helper which is an alternative to calling `flat_map` with if/else if/else blocks inside.
     *
     * @group Control Flow
     */
    if(condition: Condition<T>, handler: ConditionHandler<T, E>): IfBuilder<T, E> {
        this.t("if");

        return new IfBuilder(this)
            .else_if(condition, handler);
    }

    /**
     * Operate a case matcher across each item in the stream. Each branch of the case should
     * produce a new stream, which will be flattened into the resulting stream.
     *
     * @group Control Flow
     */
    case<U, TCase extends string | number | symbol, TCases extends Record<TCase, (value: T) => Stream<U, E>>>(
        case_generator: (value: T) => TCase,
        cases: TCases,
        fallback: (value: T) => Stream<U, E> = (_value) => Stream.empty(),
    ): Stream<U, E> {
        return this.flat_map((value) => {
            let handler = cases[case_generator(value)] || fallback;

            return handler(value);
        });
    }

    /**********
     * Higher order streams
     **********/
    /**
     * Map over each value of the stream, producing a new stream for each. Each produced stream
     * will be flattened into a single resulting stream.
     *
     * @group Higher Order Streams
     */
    flat_map<U = T, F = E>(op: (value: T) => Stream<U, F>): Stream<U, F> {
        this.t("flat_map");

        let current_stream: Stream<U, F> | null = null;

        return this.clone_stream((provide_value) => {
            const pull_from_stream = () => {
                if (current_stream === null) {
                    provide_value(end());
                } else {
                    // Forward the next value in the current stream onwards
                    current_stream.next((value) => {
                        if (is_end(value)) {
                            // Remove the stream and try again
                            current_stream = null;

                            load_stream();
                        } else {
                            provide_value(value);
                        }
                    });
                }
            };

            const load_stream = () => {
                if (current_stream === null) {
                    // No current stream, create one
                    this.next((value) => {
                        if (is_ok(value)) {
                            // Create a new stream with the next value
                            current_stream = op(value.value);
                        }

                        pull_from_stream();
                    });
                } else {
                    // Current stream, use it
                    pull_from_stream();
                }
            };

            load_stream();
        });
    }

    /**********
     * Stream consumption
     **********/
    /**
     * Consume the stream as an async iterator. For example:
     *
     * ```
     * for await (let item of stream) {
     *     // ...
     * }
     * ```
     *
     * @group Stream Consumption
     */
    [Symbol.asyncIterator]() {
        return {
            next: () => new Promise<IteratorResult<T, unknown>>((resolve) => {
                this.next((value) => {
                    if (is_end(value)) {
                        resolve({ done: true, value: undefined });
                    } else if (is_ok(value)) {
                        resolve({ done: false, value: value.value });
                    }

                    // TODO: Work out what to do with error variant
                });
            })
        };
    }

    /**
     * Consume the stream, producing an array of values. Currently undefined behaviour if an error
     * is emitted in the stream.
     *
     * @group Stream Consumption
     */
    toArray(cb?: (array: Array<T>) => void): Promise<Array<T>> {
        return wrap_async(cb, (done) => {
            const array: Array<T> = [];

            this.consume<typeof array, never>((value, done) => {
                if (is_end(value)) {
                    done([ok(array), end()]);
                } else if (is_ok(value)) {
                    array.push(value.value);

                    // Continually retry to pull everything out of the stream
                    done();
                } else {
                    console.log(value);
                    // Error of some type, work out what to do
                    done();
                }
            })
                .next((value) => {
                    if (is_ok(value)) {
                        done(value.value);
                    } else {
                        // TODO: Work out what to do here
                    }
                });
        })
    }

    /**
     * Consume the stream by calling a function for each value in the stream. Currently, error
     * values will be skipped.
     *
     * @group Stream Consumption
     */
    forEach(cb: Callback<T>) {
        this.consume_values((value, done) => {
            cb(value);
            done([]);
        })
            .exhaust();
    }

    /**
     * Consume the stream by continually pulling values from the stream, without doing anything to
     * them. This is pretty useless by itself, but convinient if a previous stream step is
     * aggregating stream values in some way.
     *
     * @group Stream Consumption
     */
    exhaust() {
        this.consume((value, done) => {
            if (is_end(value)) {
                done([end()]);
            } else {
                done();
            }
        })
            .next(nop);
    }

    /**********
     * Stream creation
     **********/
    /**
     * Create a stream with a single value in it.
     *
     * @group Stream Creation
     */
    static of<T, E>(value: ((cb: (value: T) => void) => void) | T): Stream<T, E> {
        let emitted = false;

        return new Stream((cb) => {
            if (!emitted) {
                emitted = true;

                if (value instanceof Function) {
                    value((value) => {
                        cb(ok(value));
                    });
                } else {
                    cb(ok(value));
                }
            } else {
                cb(end());
            }
        });
    }

    static of_atom<T, E>(value: ((cb: (value: Value<T, E>) => void) => void) | Value<T, E>): Stream<T, E> {
        let emitted = false;

        return new Stream((cb) => {
            if (!emitted) {
                emitted = true;

                if (value instanceof Function) {
                    value((value) => {
                        cb(normalise(value));
                    });
                } else {
                    cb(normalise(value));
                }
            } else {
                cb(end());
            }
        });
    }
    /**
     * Create a stream from some kind of value. This can be an iterable, a promise which resolves
     * to some value, or a readable stream.
     *
     * @group Stream Creation
     */
    static from<T, E>(values: Iterable<T> | Promise<T> | Readable): Stream<T, E> {
        if (Symbol.iterator in values) {
            const iter = values[Symbol.iterator]();

            return new Stream((cb) => {
                let result: IteratorResult<T, unknown> = iter.next();

                if (result.done) {
                    cb(end());
                } else {
                    cb(ok(result.value));
                }
            });
        } else if (values instanceof Promise) {
            return Stream.of((cb) => values.then(cb));
        } else if (values instanceof Readable) {
            const buffer: Array<T> = [];
            const queue: Array<(value: T) => void> = [];
            let stream_closed = false;

            values.on("data", (chunk) => {
                if (queue.length > 0) {
                    const cb = queue.shift() as (value: T) => void;
                    cb(chunk);
                } else {
                    buffer.push(chunk);
                }
            });
            values.on("close", () => {
                stream_closed = true;
            });

            return new Stream((cb) => {
                if (buffer.length > 0) {
                    // Send the latest value from the buffer
                    cb(ok(buffer.shift() as T));
                } else if (stream_closed) {
                    cb(end());
                } else {
                    // Queue the callback to recieve data
                    queue.push((value) => {
                        cb(ok(value));
                    });
                }
            });
        }

        return Stream.empty();

    }

    /**
     * Create an empty stream.
     *
     * @group Stream Creation
     */
    static empty<T, E>(): Stream<T, E> {
        return new Stream((cb) => {
            cb(end());
        });
    }

    /**
     * Create a stream from the provided array, which will continually iterate over every item.
     * This may lead to a stream that never terminates, unless termination is introduced
     * downstream.
     *
     * @group Stream Creation
     */
    static cycle<T, E>(values: ArrayLike<T>): Stream<T, E> {
        if (values.length === 0) {
            return Stream.empty();
        } else {
            let i = 0;

            return new Stream((cb) => {
                cb(ok(values[i] as T));

                i = (i + 1) % values.length;
            });
        }
    }
};

async function run() {
    console.log("running");

    // Stream.of(1)
    //     .forEach((value) => {
    //         console.log(value);
    //     });

    let s = Stream.from([
        1,
        2,
        3,
        4,
    ])
    .consume_values<number>((value, done) => {
        done([value, value * 10]);
    })
    .tap((value) => console.log("the value is", value))
    .delay(100)
    .map((value): Value<string, { custom_error: boolean, message: string }> => {
        if (value === 30) {
            // return ok("hello");
            throw new Error("bad value");
        } else if (value === 3) {
            return err({ custom_error: true, message: "hello" });
        } else {
            return ok(value.toString(10));
        }
    })
    .push("useful value");

    s.toArray((array) => {
        console.log("finished");
        console.log(array);
    });

    // s.forEach((value) => {
    //     console.log(value);
    // });

    // for await (let value of s) {
    //     console.log(value);
    // }

    Stream.from(new Promise((resolve) => {
        setTimeout(() => {
            resolve({ success: true });
        }, 2000);
    })).forEach((val) => console.log(val));

    const readable_stream = createReadStream('./src/index.ts');
    Stream.from(readable_stream)
        .forEach(console.log);

    Stream.from([1, 2, 3, 4, 5])
        .if((value) => value % 2 === 0, (value) => (
            Stream.of(value)
                .tap((value) => console.log("even value", value))
                .push(-value)
        ))
        .else_if((value) => value % 3 === 0, (_value) => (
            Stream.of(10)
        ))
        .else((value) => {
            console.log("else with", value);
            return Stream.of(value);
        })
        .toArray((arr) => {
            console.log("if else done");
            console.log(arr);
        });

    // Stream.from([1, 2, 3, 4, 5])
    //     .case(
    //         (value) => value,
    //         {
    //             1: (_value) => Stream.of("one"),
    //             2: (_value) => Stream.of("two"),
    //             3: (_value) => Stream.of("three"),
    //         } as Record<number, Stream,
    //         (value) => Stream.of(value).map((value) => err({
    //             message: "unknown value",
    //             value
    //         }))
    //     )
    //     .toArray(console.log);
}

// run();
