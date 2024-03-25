import { Readable, Writable } from "stream";
import { StreamTransforms } from "./transforms";
import { is_ok, type Atom } from "./atom";

export class Stream<T, E> extends StreamTransforms<T, E> {
    /**
     * Create a new stream with the provided atom producer.
     *
     * @param next - A callback method to produce the next atom. If no atom is available, then
     * `null` must be returned.
     */
    static fromNext<T, E>(next: () => Promise<Atom<T, E> | null>): Stream<T, E> {
        return new Stream(new Readable({
            objectMode: true,
            async read() {
                this.push(await next());
            },
        }));
    }

    /**
     * Create an iterator that will emit each atom in the stream.
     */
    [Symbol.asyncIterator](): AsyncIterator<Atom<T, E>> {
        return this.stream[Symbol.asyncIterator]();
    }

    /**
     * Create an iterator that will emit each value in the stream.
     */
    values(): AsyncIterator<T> {
        const it = this[Symbol.asyncIterator]();

        return {
             async next() {
                const { value, done } = await it.next();

                if (done) {
                    return { value, done: true };
                } else if (is_ok(value)) {
                    return { value: value.value };
                } else {
                    return await this.next();
                }
            }
        }
    }

    /**
     * Create a stream and corresponding writable Node stream, where any writes to the writable
     * Node stream will be emitted on the returned stream.
     */
    static writable<T, E>(): { stream: Stream<T, E>, writable: Writable } {
        type Semaphore<T> = Promise<T> & { resolve: (value: T) => void };
        function semaphore<T>(): Semaphore<T> {
            let resolve: (value: T) => void;

            const promise: Partial<Semaphore<T>> = new Promise((done) => {
                resolve = done;
            });

            promise.resolve = (value) => resolve(value);

            return promise as Semaphore<T>;
        }

        let nextValue = semaphore<Atom<T, E> | null>();
        let valueRead = semaphore<void>();

        // The writable stream that will receive the transformed value.
        const writable = new Writable({
            objectMode: true,
            async write(value, _encoding, callback) {
                // Emit the next value
                nextValue.resolve(value);

                // Wait for the value to be emitted before allowing further writes
                await valueRead;

                callback();
            },
            async final(callback) {
                // Emit a `null` to close the stream
                nextValue.resolve(null);

                // Wait for the read before continuing to close stream
                await valueRead;

                callback();
            }
        });

        return {
            stream: Stream.fromNext(async () => {
                // Get the next value
                const value = await nextValue;

                // Copy semaphore for marking a value as successfully read
                const oldValueRead = valueRead;

                // Reset semaphores for the next usage
                nextValue = semaphore();
                valueRead = semaphore();

                // Mark semaphore for successful read
                oldValueRead.resolve();

                // Emit the actual value
                return value;
            }),
            writable,
        };
    }
}
