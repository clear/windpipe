const STREAM_END = Symbol.for("STREAM_END");

type StreamAtom<TValue> = TValue | typeof STREAM_END;
type NextValueCallback<TValue> = (cb: (value: StreamAtom<TValue>) => void) => void;

/**
 * Consume a stream, value by value, pushing values onto a new stream. Per invocation, only **one**
 * of `push` or `retry` can be called. Calling both is invalid.
 *
 * Ideally, it would be best to somehow detect whether a value was pushed to the consumer, and if
 * nothing was automatically retry.
 *
 * # Alternate API:
 *
 * Consumer simply gets a `done` callback, which takes an array of items to push. This can be
 * called with undefined/empty array to trigger an automatic retry.
 *
 * @param value - Value being emitted in the stream
 * @param push - Callback function to emit a new value down the stream
 * @param retry - Callback function to retry the consumer, useful if no values are pushed downstream
 */
type Consumer<TValue, TValue_> = (value: StreamAtom<TValue>, push: (value: StreamAtom<TValue_>) => void, retry: () => void) => void;

class Stream<TValue> {
    get_next_value: NextValueCallback<TValue>;

    constructor(next_value: NextValueCallback<TValue>) {
        this.get_next_value = next_value;
    }

    next(cb: (value: StreamAtom<TValue>) => void) {
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

    // De-dupe value callbacks
    consume<TValue_>(consumer: Consumer<TValue, TValue_>): Stream<TValue_> {
        // Must give consumer following arguments:
        // - value: The last value emitted from the stream
        // - push: A method to add a new value to the resulting stream (can be re-used)
        // - retry: A method that will get the next item from downstream and pass it through the consumer

        let queue: Array<StreamAtom<TValue_>> = [];

        return new Stream((provide_value) => {
            let value_provided = false;

            const emit_value = () => {
                if (!value_provided) {
                    if (queue.length > 0) {
                        // Value remains in queue, fetch it before continuing
                        value_provided = true;
                        return provide_value(queue.shift() as any);
                    } else {
                        // Queue is empty, which means that no values were pushed. Try again.
                        console.warn("somehow ended up with an empty queue");
                        // return provide_value(STREAM_END);
                    }
                }
            }
            
            const feed_consumer = () => {
                let retry_called = false;
                let push_called = false;

                // Make sure that queue has some values in it
                if (queue.length === 0) {
                    // Get the value from upstream
                    this.next((value) => {
                        // Take value, and add it to the end of the queue
                        const push = (value: StreamAtom<TValue_>) => {
                            console.log("pushing", value);

                            if (!retry_called) {
                                push_called = true;

                                queue.push(value);
                                emit_value();
                            } else {
                                console.error("retry and push cannot be called together");
                            }
                        };

                        // Consumer wasn't fed, try it agaian
                        const retry = () => {
                            if (!push_called) {
                                retry_called = true;

                                feed_consumer();
                            } else {
                                console.error("retry and push cannot be called together");
                            }
                        };

                        consumer(value, push, retry);
                    });
                } else {
                    // There's a value in the queue, emit it without calling the consumer
                    emit_value();
                }
            };

            feed_consumer();
        });
    }

    map<TValue_>(op: (value: TValue) => TValue_): Stream<TValue_> {
        return this.consume((value, push, _retry) => {
            if (value === STREAM_END) {
                push(STREAM_END);
            } else {
                push(op(value));
            }
        });
    }

    delay(ms: number): Stream<TValue> {
        return new Stream((cb) => {
            const then = Date.now();

            this.next((value) => {
                const now = Date.now();

                setTimeout(() => {
                    cb(value);
                }, ms - (now - then));
            });
        });
    }

    [Symbol.asyncIterator]() {
        return {
            next: () => new Promise<IteratorResult<TValue, unknown>>((resolve) => {
                this.next((value) => {
                    if (value === STREAM_END) {
                        resolve({ done: true, value: undefined });
                    } else {
                        resolve({ done: false, value });
                    }
                });
            })
        };
    }

    toArray(cb: (array: Array<TValue>) => void) {
        const array: Array<TValue> = [];

        this.consume((value, push, retry) => {
            if (value === STREAM_END) {
                push(array);
                push(STREAM_END);
            } else {
                console.log("saving", value);
                array.push(value);

                // Continually retry to pull everything out of the stream
                retry();
            }
        })
            .next((value: any) => cb(value));
    }

    static from<TValue>(values: Iterable<TValue>): Stream<TValue> {
        const iter = values[Symbol.iterator]();

        return new Stream((cb) => {
            let result: IteratorResult<TValue, unknown> = iter.next();

            if (result.done) {
                cb(STREAM_END);
            } else {
                cb(result.value);
            }
        });
    }
};

async function run() {
    console.log("running");

    let s = Stream.from([
        1,
        2,
        3
    ])
    // .delay(1000)
    .consume((value, push, _retry) => {
        if (value === STREAM_END) {
            push(STREAM_END);
        } else {
            console.log("double", value);
            push(value);
            push(value * 10);
        }
    })
    // TODO: Fix inference
    // .map((value) => (value as number).toString(10));

    s.toArray((array) => {
        console.log("finished");
        console.log(array);
    });

    // for await (let value of s) {
    //     console.log(value);
    // }

    console.log("async done");
}

run();
