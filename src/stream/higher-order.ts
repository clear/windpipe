import { Stream } from ".";
import { isError, isOk, type Atom, isException } from "../atom";
import { run } from "../handler";
import { type CallbackOrStream, type MaybePromise, exhaust } from "../util";
import { StreamTransforms } from "./transforms";

function accept<T>(value: T): { accept: T } {
    return { accept: value };
}

function reject<T>(value: T): { reject: T } {
    return { reject: value };
}

type FilterResult<A, R> = { accept: A } | { reject: R };

type IfNever<T, A, B> = [T] extends [never] ? A : B;

export class HigherOrderStream<T, E> extends StreamTransforms<T, E> {
    /**
     * Base implementation of `flat*` operations. In general, all of these methods will filter over
     * the type of atom, run some stream-producing callback with it, and then produce a new
     * generator to expand into the stream.
     *
     * @template A - The accepted type from the filter. Allows for type narrowing from `Atom<T, E>`
     * into `AtomOk<T>`, etc.
     * @template U - The `ok` type of the produced stream.
     * @template F - The `error` type of the produced stream.
     * @template CT - The `ok` type of the stream produced from the callback.
     * @template CE - The `error` type of the stream produced from the callback.
     */
    private flatOp<A, U, F, CT, CE>(
        filter: (atom: Atom<T, E>) => FilterResult<A, Atom<U, F>>,
        cb: (atom: A) => MaybePromise<Stream<CT, CE>>,
        process: (atom: Atom<T, E>, stream: Stream<CT, CE>) => AsyncGenerator<Atom<U, F>>,
    ): Stream<U, F> {
        const trace = this.trace("flatOp");

        return this.consume(async function*(it) {
            for await (const atom of it) {
                const result = filter(atom);

                if ("reject" in result) {
                    yield result.reject;
                    continue;
                }

                // Run the flat map handler
                const streamAtom = await run(() => cb(result.accept), trace);

                // If an error was emitted whilst initialising the new stream, return it
                if (!isOk(streamAtom)) {
                    yield streamAtom;
                    continue;
                }

                // Otherwise, consume the iterator
                yield* process(atom, streamAtom.value);
            }
        });
    }

    /**
     * Internal helper for implementing the other `flatMap` methods.
     */
    private flatMapAtom<A, U, F>(
        filter: (atom: Atom<T, E>) => FilterResult<A, Atom<U, F>>,
        cb: (atom: A) => MaybePromise<Stream<U, F>>,
    ): Stream<U, F> {
        this.trace("flatMapAll");

        return this.flatOp(filter, cb, async function*(_atom, stream) {
            yield* stream;
        });
    }

    /**
     * Map over each value in the stream, produce a stream from it, and flatten all the value
     * streams together
     *
     * @group Higher Order
     */
    flatMap<U>(cb: (value: T) => MaybePromise<Stream<U, E>>): Stream<U, E> {
        this.trace("flatMap");

        return this.flatMapAtom(
            (atom) => (isOk(atom) ? accept(atom) : reject(atom)),
            (atom) => {
                return cb(atom.value);
            },
        );
    }

    /**
     * Map over each error in the stream, produce a stream from it, and flatten all the value
     * streams together.
     *
     * @group Higher Order
     */
    flatMapError<F>(cb: (value: E) => MaybePromise<Stream<T, F>>): Stream<T, F> {
        this.trace("flatMapError");

        return this.flatMapAtom(
            (atom) => (isError(atom) ? accept(atom) : reject(atom)),
            (atom) => {
                return cb(atom.value);
            },
        );
    }

    /**
     * Maps over each exception in the stream, producing a new stream from it, and flatten all
     * the value streams together.
     *
     * @group Higher Order
     */
    flatMapException(
        cb: (value: unknown, trace: string[]) => MaybePromise<Stream<T, E>>,
    ): Stream<T, E> {
        const trace = this.trace("flatMapException");

        return this.flatMapAtom(
            (atom) => (isException(atom) ? accept(atom) : reject(atom)),
            (atom) => {
                return cb(atom.value, trace);
            },
        );
    }

    /**
     * @group Higher Order
     * @deprecated use `flatMapException` instead
     */
    flatMapUnknown(
        cb: (value: unknown, trace: string[]) => MaybePromise<Stream<T, E>>,
    ): Stream<T, E> {
        return this.flatMapException(cb);
    }

    /**
     * Map over each value in the stream, produce a stream from it, cache the resultant stream
     * and flatten all the value streams together
     *
     * @group Higher Order
     */
    cachedFlatMap<U>(
        cb: (value: T) => MaybePromise<Stream<U, E>>,
        keyFn: (value: T) => string | number | symbol,
    ): Stream<U, E> {
        const trace = this.trace("cachedFlatMap");

        return this.consume(async function*(it) {
            const cache = new Map<PropertyKey, Atom<U, E>[]>();

            for await (const atom of it) {
                if (!isOk(atom)) {
                    yield atom;
                    continue;
                }

                const key = keyFn(atom.value);
                const cachedValues = cache.get(key);

                if (cachedValues !== undefined) {
                    yield* cachedValues;
                    continue;
                }

                // Run the flat map handler
                const streamAtom = await run(() => cb(atom.value), trace);

                // If an error was emitted whilst initialising the new stream, return it
                if (!isOk(streamAtom)) {
                    yield streamAtom;
                    continue;
                }

                // Otherwise, consume the iterator
                const values = await streamAtom.value.toArray({ atoms: true });

                cache.set(key, values);

                yield* values;
            }
        });
    }

    /**
     * Produce a new stream from the stream that has any nested streams flattened
     *
     * @note Any atoms that are not nested streams are emitted as-is
     * @group Higher Order
     */
    flatten(): T extends Stream<infer U, E> ? Stream<U, E> : Stream<T, E> {
        this.trace("flatten");

        return this.consume(async function*(it) {
            for await (const atom of it) {
                // Yield errors/unkowns directly
                if (!isOk(atom)) {
                    yield atom;
                    continue;
                }

                // Yield each atom within nested streams
                if (atom.value instanceof Stream) {
                    yield* atom.value;
                } else {
                    yield atom;
                }
            }
        }) as T extends Stream<infer U, E> ? Stream<U, E> : Stream<T, E>;
    }

    /**
     * Produce a new stream from the stream that has any nested streams merged together, emitting their
     * atoms as they are emitted.
     *
     * @note Any atoms that are not nested streams are emitted as-is
     * @group Higher Order
     */
    merge(): T extends Stream<infer U, E> ? Stream<U, E> : Stream<T, E> {
        this.trace("merge");

        // @ts-ignore
        return this.consume(async function*(it) {
            // Get an iterator for the stream of streams
            const outer = it[Symbol.asyncIterator]();

            // Are we overall done with consuming the outer stream?
            let outerExhausted = false;

            // Keep a map from inner iterators to their pending next() promise
            // we can race them to get the next value but we only remove then once resolved so we dont drop any values
            const innerPending = new Map<AsyncIterator<Atom<any, any>>, Promise<IteratorResult<Atom<any, any>>>>();

            // While we either have outer atoms to pull yet or we are waiting for inner streams to exhaust
            // keep looping and racing them
            while (!outerExhausted || innerPending.size > 0) {
                // We could race either a new nested stream from outer or a new atom from an inner
                type OuterResult = IteratorResult<Atom<any, any>> & { type: "outer" };
                type InnerResult = IteratorResult<Atom<any, any>> & { type: "inner", iterator: AsyncIterator<Atom<any, any>> };
                type Source = Promise<OuterResult | InnerResult>;
                const sources: Array<Source> = [];

                // Is there still nested streams in outer?
                if (!outerExhausted) {
                    sources.push(outer.next().then(r => ({ ...r, type: "outer" })));
                }

                // Are there active inner streams still?
                // For each, we want to race their pending value
                for (const [iterator, nextPromise] of innerPending) {
                    sources.push(nextPromise.then(r => ({ ...r, iterator, type: "inner" })));
                }

                // Anything left to wait on?
                // (NOTE: unlikely to trigger since this is effectively the "while" condition)
                if (sources.length === 0) {
                    break;
                }

                // Okay now race all the sources
                const winner = await Promise.race(sources);
                // Is this an inner result? We add an `iterator` key to those
                if (winner.type === 'inner') {
                    if (winner.done) {
                        // In practice, seems like no values are included on these results, so ignoring that
                        innerPending.delete(winner.iterator);
                    } else {
                        // Yield the value and immediately call .next() to get the next one  
                        yield winner.value;
                        innerPending.set(winner.iterator, winner.iterator.next());
                    }

                    continue;
                }

                // Is this an outer result?
                if (winner.type === 'outer') {
                    if (winner.done) {
                        outerExhausted = true;
                    } else {
                        const atom = winner.value;
                        if (!isOk(atom)) {
                            // If an error, just emit it
                            yield atom;
                        } else if (atom.value instanceof Stream) {
                            // if a value and its a stream, start tracking it
                            const iter = atom.value[Symbol.asyncIterator]();
                            innerPending.set(iter, iter.next());
                        } else {
                            // If a value and not a stream, just emit it
                            yield atom;
                        }
                    }
                    continue;
                }

                throw new Error("invalid result. unreachable")
            }
        });
    }

    /**
     * Base implementation of the `flatTap` operations.
     */
    private flatTapAtom<A>(
        filter: (atom: Atom<T, E>) => FilterResult<A, Atom<T, E>>,
        cb: (atom: A) => MaybePromise<Stream<unknown, unknown>>,
    ): Stream<T, E> {
        this.trace("flatTapAtom");

        return this.flatOp(filter, cb, async function*(atom, stream) {
            await exhaust(stream);

            yield atom;
        });
    }

    /**
     * Produce a stream for each value in the stream. The resulting stream will be emptied,
     * however the resulting values will just be dropped. This is analogous to an asynchronous
     * side effect.
     *
     * @group Higher Order
     */
    flatTap(cb: (value: T) => MaybePromise<Stream<unknown, unknown>>): Stream<T, E> {
        this.trace("flatTap");

        return this.flatTapAtom(
            (atom) => (isOk(atom) ? accept(atom) : reject(atom)),
            (atom) => cb(atom.value),
        );
    }

    /**
     * Emit items from provided stream if this stream is completely empty.
     *
     * @note If there are any errors or exceptions on the stream, then the new stream won't be
     * consumed.
     *
     * @group Higher Order
     */
    otherwise<F extends IfNever<E, unknown, E>>(cbOrStream: CallbackOrStream<T, F>): Stream<T, F> {
        return this.consume(async function*(it) {
            // Count the items being emitted from the iterator
            let count = 0;
            for await (const atom of it) {
                count += 1;
                yield atom as Atom<T, F>;
            }

            // If nothing was emitted, then create the stream and emit it
            if (count === 0) {
                if (typeof cbOrStream === "function") {
                    yield* cbOrStream();
                } else {
                    yield* cbOrStream;
                }
            }
        });
    }

    /**
     * Consume the entire stream, and completely replace it with a new stream. This will remove
     * any errors and exceptions currently on the stream.
     *
     * Equivalent to:
     *
     * ```
     * stream
     *   .filter(() => false)
     *   .otherwise(newStream);
     * ```
     * `
     *
     * @group Higher Order
     */
    replaceWith<U, F>(cbOrStream: CallbackOrStream<U, F>): Stream<U, F> {
        return this.consume(async function*(it) {
            // Consume all the items in the stream
            await exhaust(it);

            // Replace with the user stream
            if (typeof cbOrStream === "function") {
                yield* cbOrStream();
            } else {
                yield* cbOrStream;
            }
        });
    }
}
