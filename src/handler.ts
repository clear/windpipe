import type { Atom, MaybeAtom } from "./atom";
import * as atom from "./atom";

export type MaybePromise<T> = Promise<T> | T;

/**
 * Given some value, will either await it if it's a promise, or return the value un-modified. This
 * is an async function so that the result can be `await`ed regardless of whether the value is
 * actually a promise or not.
 */
async function normalisePromise<T>(value: MaybePromise<T>): Promise<T> {
    if (value instanceof Promise) {
        return await value;
    } else {
        return value;
    }
}

/**
 * Run the given handler, then the returned value will be normalised as an atom and returned. If an
 * unhandled error is thrown during the handler, then it will be caught and returned as an `unknown`
 * atom.
 */
export async function handler<T, E>(handler: () => MaybePromise<MaybeAtom<T, E>>, trace: string[]): Promise<Atom<T, E>> {
    try {
        // Run the handler
        const rawResult = handler();

        // Normalise the returned promise
        const result = await normalisePromise(rawResult);

        // Normalise as an atom and return
        return atom.normalise(result);
    } catch (e) {
        // Unknown error thrown, return it
        return atom.unknown(e, trace);
    }
}
