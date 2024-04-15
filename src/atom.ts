export const VALUE = Symbol.for("VALUE");
export const ERROR = Symbol.for("ERROR");
export const UNKNOWN = Symbol.for("UNKNOWN");

export type AtomOk<T> = { type: typeof VALUE; value: T };
export type AtomErr<E> = { type: typeof ERROR; value: E };
export type AtomUnknown = { type: typeof UNKNOWN; value: unknown; trace: Array<string> };

export type Atom<T, E> = AtomOk<T> | AtomErr<E> | AtomUnknown;
export type MaybeAtom<T, E> = T | Atom<T, E>;

export const ok = <T, E>(value: T): Atom<T, E> => ({ type: VALUE, value });
export const error = <T, E>(error: E): Atom<T, E> => ({ type: ERROR, value: error });
export const unknown = <T, E>(error: unknown, trace: Array<string>): Atom<T, E> => ({
    type: UNKNOWN,
    value: error,
    trace: [...trace],
});

export const isOk = <T, E>(atom: Atom<T, E>): atom is AtomOk<T> => atom.type === VALUE;
export const isError = <T, E>(atom: Atom<T, E>): atom is AtomErr<E> => atom.type === ERROR;
export const isUnknown = <T, E>(atom: Atom<T, E>): atom is AtomUnknown => atom.type === UNKNOWN;

/**
 * Given some value (which may or may not be an atom), convert it into an atom. If it is not an
 * atom, then it will be turned into an `ok` atom.
 */
export function normalise<T, E>(value: MaybeAtom<T, E>): Atom<T, E> {
    if (
        value !== null &&
        typeof value === "object" &&
        "type" in value &&
        (isOk(value) || isError(value) || isUnknown(value))
    ) {
        return value;
    } else {
        return ok(value);
    }
}
