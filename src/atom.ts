export const VALUE = Symbol.for("VALUE");
export const ERROR = Symbol.for("ERROR");
export const EXCEPTION = Symbol.for("EXCEPTION");
/** @deprecated use `EXCEPTION` instead */
export const UNKNOWN = EXCEPTION;

export type AtomOk<T> = { type: typeof VALUE; value: T };
export type AtomError<E> = { type: typeof ERROR; value: E };
export type AtomException = { type: typeof EXCEPTION; value: unknown; trace: Array<string> };
/** @deprecated use `AtomException` instead */
export type AtomUnknown = AtomException;

export type Atom<T, E> = AtomOk<T> | AtomError<E> | AtomException;
export type MaybeAtom<T, E> = T | Atom<T, E>;

export const ok = <T, E>(value: T): Atom<T, E> => ({ type: VALUE, value });
export const error = <T, E>(error: E): Atom<T, E> => ({ type: ERROR, value: error });
export const exception = <T, E>(error: unknown, trace: Array<string>): Atom<T, E> => ({
    type: EXCEPTION,
    value: error,
    trace: [...trace],
});
/** @deprecated use `exception` instead */
export const unknown = exception;

export const isOk = <T, E>(atom: Atom<T, E>): atom is AtomOk<T> => atom.type === VALUE;
export const isError = <T, E>(atom: Atom<T, E>): atom is AtomError<E> => atom.type === ERROR;
export const isException = <T, E>(atom: Atom<T, E>): atom is AtomException =>
    atom.type === EXCEPTION;
/** @deprecated use `isUnknown` instead */
export const isUnknown = isException;

/**
 * Given some value (which may or may not be an atom), convert it into an atom. If it is not an
 * atom, then it will be turned into an `ok` atom.
 */
export function normalise<T, E>(value: MaybeAtom<T, E>): Atom<T, E> {
    if (
        value !== null &&
        typeof value === "object" &&
        "type" in value &&
        (isOk(value) || isError(value) || isException(value))
    ) {
        return value;
    } else {
        return ok(value);
    }
}
