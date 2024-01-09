const STREAM_END = Symbol.for("STREAM_END");

type StreamAtom<TValue> = TValue | typeof STREAM_END;
type NextValueCallback<TValue> = (cb: (value: StreamAtom<TValue>) => void) => void;

/**
 * Consume a stream, value by value, pushing values onto a new stream.
 *
 * Consumer simply gets a `done` callback, which takes any items to push. This can be
 * called with undefined/empty array to trigger an automatic retry.
 *
 * @param value - Value being emitted in the stream.
 * @param done - Callback to be passed values to be pushed onto new stream
 */
type Consumer<TValue, TValue_> = (value: StreamAtom<TValue>, done: (...values: Array<StreamAtom<TValue_>>) => void) => void;

class Stream<TValue> {
    get_next_value: NextValueCallback<TValue>;

    constructor(next_value: NextValueCallback<TValue>) {
        this.get_next_value = next_value;
    }

    /**
     * Get next value in stream, ensuring that the callback is only called once.
     */
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

    consume<TValue_>(consumer: Consumer<TValue, TValue_>): Stream<TValue_> {
        let queue: Array<StreamAtom<TValue_>> = [];

        return new Stream((provide_value) => {
            let value_provided = false;

            const emit_value = () => {
                if (queue.length > 0) {
                    // Value remains in queue, fetch it before continuing
                    value_provided = true;
                    return provide_value(queue.shift() as StreamAtom<TValue_>);
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
                        consumer(value, (...values) => {
                            // Update the queue
                            queue = queue.concat(values);

                            // Emit value
                            emit_value();
                        });
                    });
                } else {
                    // There's a value in the queue, emit it without calling the consumer
                    emit_value();
                }
            };

            emit_value();
        });
    }

    map<TValue_>(op: (value: TValue) => TValue_): Stream<TValue_> {
        return this.consume((value, done) => {
            if (value === STREAM_END) {
                done(STREAM_END);
            } else {
                done(op(value));
            }
        });
    }

    tap(op: (value: TValue) => void): Stream<TValue> {
        return this.consume((value, done) => {
            if (value === STREAM_END) {
                done(STREAM_END);
            } else {
                op(value);
                done(value);
            }
        });
    }

    delay(ms: number): Stream<TValue> {
        return this.consume((value, done) => {
            setTimeout(() => {
                done(value);
            }, ms);
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

        this.consume((value, done) => {
            if (value === STREAM_END) {
                done(array, STREAM_END);
            } else {
                array.push(value);

                // Continually retry to pull everything out of the stream
                done();
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
        3,
        4,
    ])
    .consume<number>((value, done) => {
        if (value === STREAM_END) {
            done(STREAM_END);
        } else {
            done(value, value * 10);
        }
    })
    .tap((value) => console.log("the value is", value))
    .delay(250)
    .map((value) => value.toString(10));

    // s.toArray((array) => {
    //     console.log("finished");
    //     console.log(array);
    // });

    for await (let value of s) {
        console.log(value);
    }

    console.log("async done");
}

run();
