export const VALUE = Symbol.for("VALUE");
export const ERROR = Symbol.for("ERROR");
export const UNKNOWN = Symbol.for("UNKNOWN");

export type AtomOk<T> = { type: typeof VALUE, value: T };
export type AtomErr<E> = { type: typeof ERROR, value: E };
export type AtomUnknown = { type: typeof UNKNOWN, value: unknown, trace: Array<string> };

export type Atom<T, E> =
     AtomOk<T> |
     AtomErr<E> |
     AtomUnknown;

export const ok = <T, E>(value: T): Atom<T, E> => ({ type: VALUE, value });
export const err = <T, E>(err: E): Atom<T, E> => ({ type: ERROR, value: err });
export const unknown = <T, E>(err: unknown, trace: Array<string>): Atom<T, E> => ({ type: UNKNOWN, value: err, trace: [...trace] });

export const is_ok = <T, E>(atom: Atom<T, E>): atom is AtomOk<T> => atom.type === VALUE;
export const is_err = <T, E>(atom: Atom<T, E>): atom is AtomErr<E> => atom.type === ERROR;
export const is_unknown = <T, E>(atom: Atom<T, E>): atom is AtomUnknown => atom.type === UNKNOWN;
