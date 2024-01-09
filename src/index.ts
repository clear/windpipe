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

    [Symbol.iterator]() {
        return this;
    }

    // next(): IteratorResult<TValue, void> {
    //   let result = this.next_value();

    //   if (result == STREAM_END) {
    //     return { done: true };
    //   } else {
    //     return { done: false, value: result };
    //   }
    // }

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

Stream.from([
    1,
    2,
    3
])
    .map((value) => value.toString(10))
    .toArray((array) => {
        console.log(array);
    });

