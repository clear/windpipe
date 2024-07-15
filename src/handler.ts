import {
    normalise,
    ok,
    exception,
    isException,
    type Atom,
    type AtomOk,
    type AtomException,
    type MaybeAtom,
} from "./atom";
import type { MaybePromise } from "./util";

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
export async function handler<T, E>(
    handler: () => MaybePromise<MaybeAtom<T, E>>,
    trace: string[],
): Promise<Atom<T, E>> {
    const result = await run(handler, trace);

    if (isException(result)) {
        return result;
    }

    return normalise(result.value);
}

/**
 * Run some callback. If it completes successfully, the value will be returned as `AtomOk`. If an
 * error is thrown, it will be caught and returned as an `AtomUnknown`. `AtomError` will never be
 * produced from this helper.
 */
export async function run<T>(
    cb: () => MaybePromise<T>,
    trace: string[],
): Promise<AtomOk<T> | AtomException> {
    try {
        return ok(await normalisePromise(cb())) as AtomOk<T>;
    } catch (e) {
        return exception(e, trace) as AtomException;
    }
}
