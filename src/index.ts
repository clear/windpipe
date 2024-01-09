const STREAM_END = Symbol.for("STREAM_END");

type StreamAtom<TValue> = TValue | typeof STREAM_END;
type NextValueCallback<TValue> = (cb: (value: StreamAtom<TValue>) => void) => void;

class Stream<TValue> {
    get_next_value: NextValueCallback<TValue>;

    constructor(next_value: NextValueCallback<TValue>) {
        this.get_next_value = next_value;
    }

    map<TValue_>(op: (value: TValue) => TValue_): Stream<TValue_> {
        return new Stream((cb) => {
            this.get_next_value((value) => {
                if (value === STREAM_END) {
                    cb(STREAM_END);
                } else {
                    cb(op(value));
                }
            });
        });
    }

    delay(ms: number): Stream<TValue> {
        return new Stream((cb) => {
            const then = Date.now();

            this.get_next_value((value) => {
                const now = Date.now();

                setTimeout(() => {
                    cb(value);
                }, ms - (now - then));
            });
        });
    }

    [Symbol.asyncIterator]() {
        return this;
    }

    next(): Promise<IteratorResult<TValue, void>> {
        return new Promise((resolve) => {
            this.get_next_value((value) => {
                if (value === STREAM_END) {
                    resolve({ done: true, value: undefined });
                } else {
                    resolve({ done: false, value });
                }
            });
        });
    }

    toArray(cb: (array: Array<TValue>) => void) {
        let array: Array<TValue> = [];

        const recurse = () => {
            this.get_next_value((value) => {
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

console.log("running");

let s = Stream.from([
    1,
    2,
    3
])
    .delay(1000)
    .map((value) => value.toString(10));

for await (let value of s) {
    console.log(value);
}

console.log("async done");
