import { Stream } from "./stream";
import type { StreamBase } from "./stream/base";
import { ok, error, unknown, isOk, isError, isUnknown } from "./atom";
export * from "./util";

export { Stream, type StreamEnd } from "./stream";
export type { Atom, AtomOk, AtomError, AtomUnknown } from "./atom";

// Attempt to emulate Highland API
type HighlandConstructor = (typeof StreamBase)["from"] & {
    of: (typeof StreamBase)["of"];

    /**
     * Create a stream with a single `ok` atom on it.
     */
    ok: <T, E>(value: T) => Stream<T, E>;

    /**
     * Create a stream with a single `error` atom on it.
     */
    error: <T, E>(value: E) => Stream<T, E>;

    /**
     * Create a stream with a single `unknown` atom on it.
     */
    unknown: <T, E>(value: unknown) => Stream<T, E>;
};
export const $: HighlandConstructor = Stream.from as HighlandConstructor;
$.of = Stream.of;

$.ok = (value) => Stream.of(ok(value));
$.error = (value) => Stream.of(error(value));
$.unknown = (value) => Stream.of(unknown(value, []));

export const atom = {
    ok,
    error,
    unknown,
    isOk,
    isError,
    isUnknown,
};
