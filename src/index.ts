const STREAM_END = Symbol.for("STREAM_END");

type StreamAtom<TValue> = TValue | typeof STREAM_END;
type NextValueCallback<TValue> = (cb: (value: StreamAtom<TValue>) => void) => void;

/**
 * @param value - Value being emitted in the stream
 * @param push - Callback function to emit a new value down the stream
 */
type ConsumeCallback<TValue, TValue_> = (value: StreamAtom<TValue>, push: (value: StreamAtom<TValue_>) => void) => void;

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
    consume<TValue_>(consumer: ConsumeCallback<TValue, TValue_>): Stream<TValue_> {
        // Must give consumer following arguments:
        // - value: The last value emitted from the stream
        // - push: A method to add a new value to the resulting stream (can be re-used)

        let queue: Array<StreamAtom<TValue_>> = [];

        return new Stream((provide_value) => {
            // Make sure that queue has some values in it
            if (queue.length === 0) {

                // Get the value from upstream
                this.next((value) => {
                    // Build the push/next methods

                    // Take value, and add it to the end of the queue
                    const push = (value: StreamAtom<TValue_>) => {
                        queue.push(value);
                    };

                    consumer(value, push);
                });
            }

            if (queue.length > 0) {
                // Value remains in queue, fetch it before continuing
                return provide_value(queue.shift() as any);
            } else {
                console.warn("somehow ended up with an empty queue");
                return provide_value(STREAM_END);
            }
        });
    }

    map<TValue_>(op: (value: TValue) => TValue_): Stream<TValue_> {
        return this.consume((value, push, ) => {
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
        let array: Array<TValue> = [];

        const recurse = () => {
            this.next((value) => {
                if (value === STREAM_END) {
                    cb(array);
                } else {
                    array.push(value);
                    recurse();
                }
            });
        };

        recurse();
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
    .consume((value, push) => {
        if (value === STREAM_END) {
            push(STREAM_END);
        } else {
            push(value);
            push(value * 10);
        }
    })
    // TODO: Fix inference
    .map((value) => (value as number).toString(10));

    for await (let value of s) {
        console.log(value);
    }

    console.log("async done");
}

run();
