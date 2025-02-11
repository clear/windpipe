import Stream, { type Atom } from ".";

/**
 * Maybe it's a promise. Maybe it's not. Who's to say.
 */
export type MaybePromise<T> = Promise<T> | T;

/**
 * The truthy representation of some type. Will ensure that the type is not null/undefined, and
 * isn't false, or an empty string.
 */
export type Truthy<T> = NonNullable<Exclude<T, false | "">>;

/**
 * Type that may be a callback that resolves to a stream, or just a stream.
 */
export type CallbackOrStream<T, E> = (() => Stream<T, E>) | Stream<T, E>;

/**
 * Completely exhausts the provided async iterator.
 */
export async function exhaust(iterable: AsyncIterable<unknown>) {
    const it = iterable[Symbol.asyncIterator]();

    // eslint-disable-next-line no-constant-condition
    while (true) {
        const result = await it.next();
        if (result.done) {
            break;
        }
    }
}

export type NodeCallback<T, E> = (err: E | null, value?: T) => void;

/**
 * Creates a `next` function and associated promise to promise-ify a node style callback. The
 * `next` function must be passed as the callback to a function, and the resulting error or value
 * will be emitted from the promise. The promise will always resolve.
 *
 * The error value of the callback (first parameter) will be emitted as an `Error` atom from the
 * promise, whilst the value of the callback (second parameter) will be emitted as an `Ok` atom on
 * the promise.
 */
export function createNodeCallback<T, E>(): [Promise<Atom<T, E>>, NodeCallback<T, E>] {
    // Resolve function to be hoisted out of the promise
    let resolve: (atom: Atom<T, E>) => void;

    // Create the prom
    const promise = new Promise<Atom<T, E>>((res) => {
        resolve = res;
    });

    // Create the next callback
    const next: NodeCallback<T, E> = (err, value) => {
        if (err) {
            resolve(Stream.error(err));
        } else if (value) {
            resolve(Stream.ok(value));
        }
    };

    // Return a tuple of the promise and next function
    return [promise, next];
}

export type Signal = Promise<void> & { done: () => void };

/**
 * Create a new 'signal', which is just a Promise that has the `resolve` method exposed on
 * the promise itself, allowing the Promise to be resolved outside of the callback by
 * calling `Promise.done()`.
 */
export function newSignal(): Signal {
    let done: () => void;

    // @ts-expect-error building signal object
    const signal: Signal = new Promise<void>((resolve) => {
        done = resolve;
    });

    // @ts-expect-error done assigned in promise initialiser
    signal.done = done;

    return signal;
}
