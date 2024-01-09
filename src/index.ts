const STREAM_END = Symbol.for("STREAM_END");

type StreamAtom<TValue> = TValue | typeof STREAM_END;
type NextValueCallback<TValue> = () => StreamAtom<TValue>;

class Stream<TValue> {
    next_value: NextValueCallback<TValue>;

    constructor(next_value: NextValueCallback<TValue>) {
        this.next_value = next_value;
    }

    map<TValue_>(op: (value: TValue) => TValue_): Stream<TValue_> {
        return new Stream(() => {
            const next = this.next_value();

            if (next === STREAM_END) {
                return STREAM_END;
            } else {
                return op(next);
            }
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

    toArray(): Array<TValue> {
        let arr = [];
        let value;

        while ((value = this.next_value()) !== STREAM_END) {
            arr.push(value);
        }

        return arr;
    }

    static from<TValue>(values: Iterable<TValue>): Stream<TValue> {
        const iter = values[Symbol.iterator]();

        return new Stream(() => {
            let result: IteratorResult<TValue, unknown> = iter.next();

            if (result.done) {
                return STREAM_END;
            } else {
                return result.value;
            }
        });
    }
};

const s = Stream.from([
    1,
    2,
    3
])
.map((value) => value.toString(10))
.toArray();

console.log(s);
