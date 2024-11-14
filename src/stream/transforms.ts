import { Stream } from ".";
import { isOk, isException, type MaybeAtom, type Atom, isError, exception, ok } from "../atom";
import { handler } from "../handler";
import { StreamConsumption } from "./consumption";
import { Readable } from "stream";
import util from "node:util";
import { type Truthy, type MaybePromise, newSignal } from "../util";

export class StreamTransforms<T, E> extends StreamConsumption<T, E> {
    /**
     * Consume the stream atoms, emitting new atoms from the generator.
     *
     * @group Transform
     */
    consume<U, F>(
        generator: (it: AsyncIterable<Atom<T, E>>) => AsyncGenerator<Atom<U, F>>,
    ): Stream<U, F> {
        const trace = this.trace("consume");

        const stream = new Stream<U, F>(Readable.from(generator(this.stream)));
        stream.stackTrace = trace;

        return stream;
    }

    /**
     * Collect the values of the stream atoms into an array then return a stream which emits that array
     *
     * @note non-ok atoms are emitted as-is, the collected array is always emitted last
     * @note empty streams will emit an empty array
     * @group Transform
     */
    collect(): Stream<T[], E> {
        this.trace("collect");

        return this.consume(async function* (it) {
            const values: T[] = [];
            for await (const atom of it) {
                if (isOk(atom)) {
                    values.push(atom.value);
                } else {
                    yield atom;
                }
            }
            yield ok(values);
        });
    }

    /**
     * Map over each value in the stream.
     *
     * @group Transform
     */
    map<U>(cb: (value: T) => MaybePromise<MaybeAtom<U, E>>): Stream<U, E> {
        const trace = this.trace("map");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (isOk(atom)) {
                    yield await handler(() => cb(atom.value), trace);
                } else {
                    yield atom;
                }
            }
        });
    }

    /**
     * Map over each error in the stream.
     *
     * @group Transform
     */
    mapError<F>(cb: (error: E) => MaybePromise<MaybeAtom<T, F>>): Stream<T, F> {
        const trace = this.trace("mapError");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (isError(atom)) {
                    yield await handler(() => cb(atom.value), trace);
                } else {
                    yield atom;
                }
            }
        });
    }

    /**
     * Map over each exception in the stream.
     *
     * @group Transform
     */
    mapException(cb: (error: unknown) => MaybePromise<MaybeAtom<T, E>>): Stream<T, E> {
        const trace = this.trace("mapException");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (isException(atom)) {
                    yield await handler(() => cb(atom.value), trace);
                } else {
                    yield atom;
                }
            }
        });
    }

    /**
     * @group Transform
     * @deprecated use `mapException` instead
     */
    mapUnknown(cb: (error: unknown) => MaybePromise<MaybeAtom<T, E>>): Stream<T, E> {
        return this.mapException(cb);
    }

    /**
     * Run a callback for each value in the stream, ideal for side effects on stream items.
     *
     * @group Transform
     */
    tap(cb: (value: T) => unknown): Stream<T, E> {
        this.trace("tap");

        return this.map((value) => {
            try {
                cb(value);
            } catch (e) {
                console.error("Error thrown in tap operation:", e);
            }

            return value;
        });
    }

    /**
     * Inspect every atom that is emitted through the stream.
     *
     * @group Transform
     */
    inspect(): Stream<T, E> {
        this.trace("inspect");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                console.log(util.inspect(atom, false, Infinity, true));

                yield atom;
            }
        });
    }

    /**
     * Filter over each value in the stream.
     *
     * @group Transform
     */
    filter(condition: (value: T) => MaybePromise<unknown>): Stream<T, E> {
        const trace = this.trace("filter");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                // Re-emit any existing errors onto the stream
                if (!isOk(atom)) {
                    yield atom;
                }

                // Run the filter condition
                const filter = await handler(() => condition(atom.value as T), trace);

                if (isOk(filter) && filter.value) {
                    yield atom;
                } else if (!isOk(filter)) {
                    // Non-value returned from the filter
                    const error: Error & { detail?: unknown } = new Error(
                        "non-ok value returned from filter condition",
                    );
                    error.detail = filter;
                    yield exception(error, trace);
                }
            }
        });
    }

    /**
     * Remove falsey values from the stream.
     *
     * This is equivalent to doing `.filter((value) => value)`.
     *
     * @group Transform
     */
    compact(): Stream<Truthy<T>, E> {
        this.trace("compact");

        return this.filter((value) => {
            if (value) {
                return true;
            } else {
                return false;
            }
        }) as Stream<Truthy<T>, E>;
    }

    /**
     * Operate on each item in the stream, reducing it into a single value. The resulting value is
     * returned in its own stream.
     *
     * @group Transforms
     */
    reduce<U>(cb: (memo: U, value: T) => MaybePromise<MaybeAtom<U, E>>, memo: U): Stream<U, E> {
        const trace = this.trace("reduce");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                if (isOk(atom)) {
                    // Run the reducer
                    const value = await handler(() => cb(memo, atom.value), trace);

                    if (isOk(value)) {
                        memo = value.value;
                    } else {
                        // Reducer produced a non-ok atom, emit it and continue reducing
                        yield value;
                    }
                } else {
                    yield atom as Atom<U, E>;
                }
            }

            yield ok(memo);
        });
    }

    /**
     * Return a stream containing the first `n` values. If `options.atoms` is `true`, then the
     * first `n` atoms rather than values will be emitted.
     *
     * @param options.atoms - If enabled, first `n` atoms will be counted, otherwise values.
     *
     * @group Transform
     */
    take(n: number, options?: { atoms?: boolean }): Stream<T, E> {
        this.trace("take");

        return this.consume(async function* (it) {
            if (n <= 0) {
                return;
            }

            let i = 0;

            for await (const atom of it) {
                if (isOk(atom) || options?.atoms === true) {
                    yield atom;
                }

                i++;

                if (i >= n) {
                    break;
                }
            }
        });
    }

    /**
     * Drop the first `n` items from the stream.
     *
     * @group Transform
     */
    drop(n: number, options?: { atoms?: boolean }): Stream<T, E> {
        this.trace("drop");

        return this.consume(async function* (it) {
            let i = 0;

            for await (const atom of it) {
                // Skip this atom if only values are desired
                if (!options?.atoms && !isOk(atom)) {
                    continue;
                }

                // Only yield if we're beyond the first n items
                if (i >= n) {
                    yield atom;
                }

                i++;
            }
        });
    }

    /**
     * Delay emitting each value on the stream by `ms`.
     *
     * @group Transform
     */
    delay(ms: number): Stream<T, E> {
        this.trace("delay");

        return this.consume(async function* (it) {
            for await (const atom of it) {
                await new Promise((resolve) => setTimeout(resolve, ms));

                yield atom;
            }
        });
    }

    /**
     * Map over each value in the stream, and apply some callback to it. This differs from `map` as
     * the upstream is continually pulled, regardless if the downstream is ready for it and whether
     * the current iteration has complete.
     *
     * # Example
     *
     * Approximate timelines are shown below. It isn't 100% correct for what's actually happening,
     * but gives the right idea.
     *
     * - `p`: producer (upstream)
     * - `m`: map operation (asynchronous)
     *
     * ## Map
     *
     * ```
     *  0ms       10ms      20ms      30ms
     *  |---------|---------|---------|---------|
     *  |<-- p -->|<-- m -->|         |         |
     *  |         |         |<-- p -->|<-- m -->|
     * ```
     *
     * ## Buffered Map
     *
     * ```
     *  0ms       10ms      20ms      30ms
     *  |---------|---------|---------|---------|
     *  |<-- p -->|<-- m -->|         |         |
     *  |         |<-- p -->|<-- m -->|         |
     *  |         |         |<-- p -->|<-- m -->|
     * ```
     *
     * @group Transform
     */
    bufferedMap<U>(
        cb: (value: T) => MaybePromise<MaybeAtom<U, E>>,
        options?: { delay?: number; maxBufferSize?: number; maxBufferPeriod?: number },
    ): Stream<U, E> {
        const trace = this.trace("bufferedMap");

        let itemReadySignal = newSignal();
        let bufferPulledSignal = newSignal();
        let lastPull = Date.now();
        let end = false;

        // Buffer all of the pending map results
        const buffer: Promise<Atom<U, E>>[] = [];

        // Continually fill up the buffer
        (async () => {
            // Continually pull items from the stream
            for await (const atom of this) {
                if (isOk(atom)) {
                    // Pass the value through the callback
                    buffer.push(handler(() => cb(atom.value), trace));
                } else {
                    // Add the atom directly to the buffer
                    buffer.push(Promise.resolve(atom));
                }

                // Trigger and rotate the signal, so that any pending stream consumers can continue
                itemReadySignal.done();
                itemReadySignal = newSignal();

                // Optionally delay re-polling, to prevent spamming the upstream
                if (options?.delay) {
                    await new Promise((resolve) => setTimeout(resolve, options.delay));
                }

                // Optionally halt if the buffer is full or if there hasn't been a pull in a while
                while (
                    (options?.maxBufferSize && buffer.length >= options?.maxBufferSize) ||
                    (options?.maxBufferPeriod && Date.now() - lastPull >= options?.maxBufferPeriod)
                ) {
                    await bufferPulledSignal;
                }
            }

            // Once the async iterator is exhausted, indicate that there will be no more items
            end = true;
            itemReadySignal.done();
        })();

        // Create the resulting stream by pulling a value from the buffer whenever one is requested
        return Stream.fromNext(async () => {
            let value: Promise<Atom<U, E>> | undefined = undefined;

            while (value === undefined) {
                if (buffer.length === 0) {
                    if (end) {
                        return Stream.StreamEnd;
                    }

                    await itemReadySignal;
                }

                value = buffer.shift();
            }

            const v = await value;

            lastPull = Date.now();
            bufferPulledSignal.done();
            bufferPulledSignal = newSignal();

            return v;
        });
    }

    /**
     * Batch items together on the stream and emit them as an array. The batch can be over some
     * size, or can be over a period of time.
     *
     * @param options.n - Batch up to `n` items (activates batching by count)
     * @param options.yeildRemaining - If the end of the stream is encountered and there are less
     * than `n` items buffered, yield them anyway
     * @param options.timeout - Batch for `timeout` milliseconds (activates batching by timeout)
     * @param options.yieldEmpty - If `timeout` is reached and no items have been emitted on the
     * stream, still emit an empty array.
     */
    batch(options: {
        n?: number;
        timeout?: number;
        yieldRemaining?: boolean;
        yieldEmpty?: boolean;
        byBucket?: (value: T) => string | number;
    }): Stream<T[], E> {
        return this.consume(async function* (it) {
            const atoms = it[Symbol.asyncIterator]();

            /**
             * Create a promise that will resolve after the specified timeout period. If no timeout
             * is provided then it will never resolve.
             */
            function newHeartbeat() {
                return new Promise<"timeout">((resolve) => {
                    if ("timeout" in options) {
                        setTimeout(() => {
                            resolve("timeout" as const);
                        }, options.timeout);
                    }
                });
            }

            // Define the promises outside of the loop, so we can re-use them without loosing the
            // previous instance.
            let nextAtom = atoms.next();
            let heartbeat = newHeartbeat();

            const batches: Record<string | number, T[]> = {};
            let totalBatchSize = 0;

            const batchFilter = options?.byBucket ?? (() => "default");

            let end = false;

            while (!end) {
                if (totalBatchSize > 1000) {
                    // Producer may not be I/O bound, yield to the event loop to give other things a
                    // chance to run.
                    await new Promise((resolve) => {
                        setTimeout(resolve, 0);
                    });
                }

                // See if an atom is ready, or if we time out
                const result = await Promise.race([heartbeat, nextAtom]);

                if (typeof result === "object" && "value" in result) {
                    // Atom was ready, process it (TypeScript types are incorrect)
                    const atom = result.value as Atom<T, E> | undefined;

                    if (atom) {
                        if (isOk(atom)) {
                            const key = batchFilter(atom.value);

                            let batch = batches[key];

                            // Add the bucket if it doesn't exist
                            if (!batch) {
                                batch = batches[key] = [];
                            }

                            batch.push(atom.value);
                            totalBatchSize += 1;

                            // Batch was modified, see if it's ready to emit
                            if (options?.n && batch.length >= options.n) {
                                yield ok<T[], E>(batch.splice(0, options.n));

                                totalBatchSize -= options.n;
                            }
                        } else {
                            // Immediately yield any errors
                            yield atom;
                        }
                    }

                    // Set up the next promise
                    nextAtom = atoms.next();

                    // Iterator is complete, stop the loop
                    if (result.done) {
                        end = true;
                    }
                }

                if (result === "timeout" && "timeout" in options) {
                    // Work out which batches are ready
                    const ready = Object.values(batches).filter(
                        (batch) => batch.length >= (options?.n ?? 1) || options?.yieldRemaining,
                    );

                    if (ready.reduce((total, batch) => total + batch.length, 0) === 0) {
                        if (options?.yieldEmpty) {
                            // Only yield an empty batch if there are absolutely no items ready to
                            // be yielded and if the configuration allows it
                            yield ok([]);
                        }
                    } else {
                        for (const batch of ready) {
                            const items = batch.splice(0, options?.n ?? batch.length);
                            yield ok<T[], E>(items);
                            totalBatchSize -= items.length;
                        }
                    }
                }

                if (result === "timeout") {
                    heartbeat = newHeartbeat();
                }
            }

            if ("timeout" in options && (totalBatchSize > 0 || options.yieldEmpty)) {
                // Wait for heartbeat to finish
                await heartbeat;

                if (totalBatchSize > 0) {
                    // Yield the rest of the batches
                    for (const batch of Object.values(batches)) {
                        if (batch.length === 0) {
                            continue;
                        }

                        yield ok(batch);
                    }
                } else if (options.yieldEmpty) {
                    // Yield the final empty batch
                    yield ok([]);
                }
            } else if (options?.n && totalBatchSize > 0) {
                for (const batch of Object.values(batches)) {
                    while (batch.length >= options.n) {
                        yield ok(batch.splice(0, options.n));
                    }

                    if (batch.length > 0 && options.yieldRemaining) {
                        yield ok(batch);
                    }
                }
            }
        });
    }

    /**
     * Run the provided callback after the first atom passes through the stream.
     *
     * @param callback - Callback to run.
     * @param [options = {}]
     * @param [options.atom = true] - Run on any atom (true by default). Will only run after first
     * `ok` atom if false.
     */
    onFirst(callback: () => void, options: { atom?: boolean } = {}): Stream<T, E> {
        this.trace("onFirst");

        return this.consume(async function* (it) {
            let first = false;

            for await (const atom of it) {
                yield atom;

                if (!first && (options?.atom !== false || Stream.isOk(atom))) {
                    callback();
                    first = true;
                }
            }
        });
    }

    /**
     * Run the provided callback after the last atom passes through the stream.
     *
     * @param callback - Callback to run.
     * @param [options = {}]
     * @param [options.atom = true] - Run on any atom (true by default). Will only run after last
     * `ok` atom if false.
     */
    onLast(callback: () => void, options: { atom?: boolean } = {}): Stream<T, E> {
        this.trace("onLast");

        return this.consume(async function* (it) {
            let emitted = false;

            for await (const atom of it) {
                yield atom;

                if (options?.atom !== false || Stream.isOk(atom)) {
                    emitted = true;
                }
            }

            if (emitted) {
                callback();
            }
        });
    }
}
