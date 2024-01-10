import { createReadStream } from "fs";
import { Readable } from "stream";

const VALUE = Symbol.for("VALUE");
const ERROR = Symbol.for("ERROR");
const UNKNOWN = Symbol.for("UNKNOWN");
const END = Symbol.for("END");

type StreamAtom<TValue, TErr> = 
    { type: typeof VALUE, value: TValue } |
    { type: typeof ERROR, value: TErr } |
    { type: typeof UNKNOWN, value: unknown, trace: Array<string> } |
    { type: typeof END };
type Value<TValue, TErr> = TValue | StreamAtom<TValue, TErr>;

const ok = <TValue, TErr>(value: TValue): StreamAtom<TValue, TErr> => ({ type: VALUE, value });
const err = <TValue, TErr>(err: TErr): StreamAtom<TValue, TErr> => ({ type: ERROR, value: err });
const unknown = <TValue, TErr>(err: unknown, trace: Array<string>): StreamAtom<TValue, TErr> => ({ type: UNKNOWN, value: err, trace: [...trace] });
const end = <TValue, TErr>(): StreamAtom<TValue, TErr> => ({ type: END });

function normalise<TValue, TErr>(value: Value<TValue, TErr>): StreamAtom<TValue, TErr> {
    if (
        value !== null
            && typeof value === "object"
            && "type" in value
            && (value.type === VALUE || value.type === ERROR || value.type === UNKNOWN || value.type === END)
    ) {
        return value;
    } else {
        return ok(value);
    }
}

type Callback<T> = (value: T) => void;
type OptionalCallback<T> = (value?: T) => void;
type CallbackProvider<TValue, TErr> = Callback<Callback<StreamAtom<TValue, TErr>>>;

/**
 * Consume a stream, value by value, pushing values onto a new stream.
 *
 * Consumer simply gets a `done` callback, which takes any items to push. This can be
 * called with undefined/empty array to trigger an automatic retry.
 *
 * @param value - Value being emitted in the stream.
 * @param done - Callback to be passed values to be pushed onto new stream
 */
type Consumer<TValue, TErr, TValue_, TErr_> = (value: StreamAtom<TValue, TErr>, done: OptionalCallback<Array<Value<TValue_, TErr_>>>) => void;

const nop = () => {};

class Stream<TValue, TErr> {
    get_next_value: CallbackProvider<TValue, TErr>;

    last_trace: Stream<any, any> | null = null;
    trace: Array<string> = [];

    constructor(next_value: CallbackProvider<TValue, TErr>) {
        this.get_next_value = next_value;
    }

    private proxy_user_function<TValue_>(f: () => Value<TValue_, TErr>): StreamAtom<TValue_, TErr> {
        try {
            return normalise(f());
        } catch (error) {
            return unknown(err, this.trace);
        };
    }

    private clone_stream<TValue_, TErr_>(next_value: CallbackProvider<TValue_, TErr_>): Stream<TValue_, TErr_> {
        const s = new Stream(next_value);

        s.last_trace = this.last_trace;
        s.trace = this.trace;

        return s;
    }

    private t(trace: string) {
        if (this.last_trace !== this) {
            this.last_trace = this;
            this.trace.push(trace);
        }
    }

    /**
     * Get next value in stream, ensuring that the callback is only called once.
     */
    next(cb: (value: StreamAtom<TValue, TErr>) => void) {
        let emitted = false;

        this.get_next_value((value) => {
            if (emitted) {
                console.error("value emitted twice");
            } else {
                emitted = true;
                cb(value);
            }
        });
    }

    consume<TValue_, TErr_>(consumer: Consumer<TValue, TErr, TValue_, TErr_>): Stream<TValue_, TErr_> {
        this.t("consume");

        let queue: Array<StreamAtom<TValue_, TErr_>> = [];

        return this.clone_stream((provide_value) => {
            let value_provided = false;

            const emit_value = () => {
                if (queue.length > 0) {
                    // Value remains in queue, fetch it before continuing
                    value_provided = true;
                    return provide_value(queue.shift() as StreamAtom<TValue_, TErr_>);
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

    consume_values<TValue_>(consumer: (value: TValue, done: Callback<Array<Value<TValue_, TErr>>>) => void): Stream<TValue_, TErr> {
        this.t("consume_values");

        return this.consume((value, done) => {
            if (value.type === VALUE) {
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

    push(value: TValue): Stream<TValue, TErr> {
        this.t("push");

        let pushed = false;
        return this.consume((next_value, done) => {
            if (next_value.type === END && !pushed) {
                pushed = true;
                done([normalise(value), next_value]);
            } else {
                done([next_value]);
            }
        });
    }

    map<TValue_>(op: (value: TValue) => Value<TValue_, TErr>): Stream<TValue_, TErr> {
        this.t("map");

        return this.consume_values((value, done) => {
            const result = this.proxy_user_function(() => (
                op(value)
            ));

            done([result]);
        });
    }

    tap(op: (value: TValue) => void): Stream<TValue, TErr> {
        this.t("tap");

        return this.consume_values((value, done) => {
            this.proxy_user_function(() => {
                op(value);
            });

            done([ok(value)]);
        });
    }

    delay(ms: number): Stream<TValue, TErr> {
        this.t("delay");

        return this.consume((value, done) => {
            setTimeout(() => {
                done([value]);
            }, ms);
        });
    }

    [Symbol.asyncIterator]() {
        return {
            next: () => new Promise<IteratorResult<TValue, unknown>>((resolve) => {
                this.next((value) => {
                    if (value.type === END) {
                        resolve({ done: true, value: undefined });
                    } else if (value.type === VALUE) {
                        resolve({ done: false, value: value.value });
                    }

                    // TODO: Work out what to do with error variant
                });
            })
        };
    }

    toArray(cb: (array: Array<TValue>) => void) {
        const array: Array<TValue> = [];

        this.consume<typeof array, never>((value, done) => {
            if (value.type === END) {
                done([ok(array), end()]);
            } else if (value.type === VALUE) {
                array.push(value.value);

                // Continually retry to pull everything out of the stream
                done();
            } else {
                // Error of some type, work out what to do
                done();
            }
        })
            .next((value) => {
                if (value.type === VALUE) {
                    cb(value.value);
                } else {
                    // TODO: Work out what to do here
                }
            });
    }

    forEach(cb: (value: TValue) => void) {
        this.consume_values((value, done) => {
            cb(value);
            done([]);
        })
            .exhaust();
    }

    exhaust() {
        this.consume((_value, done) => {
            done();
        })
            .next(nop);
    }

    static of<TValue, TErr>(value: ((cb: (value: TValue) => void) => void) | TValue): Stream<TValue, TErr> {
        let emitted = false;

        return new Stream((cb) => {
            if (!emitted) {
                if (value instanceof Function) {
                    value((value) => {
                        cb(ok(value));
                    });
                } else {
                    cb(ok(value));
                }

                emitted = true;
            } else {
                cb(end());
            }
        });
    }

    static from<TValue, TErr>(values: Iterable<TValue> | Promise<TValue> | Readable): Stream<TValue, TErr> {
        if (Symbol.iterator in values) {
            const iter = values[Symbol.iterator]();

            return new Stream((cb) => {
                let result: IteratorResult<TValue, unknown> = iter.next();

                if (result.done) {
                    cb(end());
                } else {
                    cb(ok(result.value));
                }
            });
        } else if (values instanceof Promise) {
            return Stream.of((cb) => values.then(cb));
        } else if (values instanceof Readable) {
            const buffer: Array<TValue> = [];
            const queue: Array<(value: TValue) => void> = [];
            let stream_closed = false;

            values.on("data", (chunk) => {
                if (queue.length > 0) {
                    const cb = queue.shift() as (value: TValue) => void;
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
                    cb(ok(buffer.shift() as TValue));
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

    static empty<TValue, TErr>(): Stream<TValue, TErr> {
        return new Stream((cb) => {
            cb(end());
        });
    }

    static cycle<TValue, TErr>(values: ArrayLike<TValue>): Stream<TValue, TErr> {
        if (values.length === 0) {
            return Stream.empty();
        } else {
            let i = 0;

            return new Stream((cb) => {
                cb(ok(values[i] as TValue));

                i = (i + 1) % values.length;
            });
        }
    }
};

async function run() {
    console.log("running");

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
            return ok("hello");
            // throw new Error("bad value");
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
}

run();
