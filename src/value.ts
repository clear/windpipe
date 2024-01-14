import { type Atom, VALUE, ERROR, UNKNOWN, END, ok } from "./atom";

/**
 * Helper type, allowing for `TValue` or an `Atom` to be used interchangably. Most commonly, this
 * will be used as the return value of various function defined by the user.
 */
export type Value<TValue, TErr> = TValue | Atom<TValue, TErr>;

/**
 * Convert a `Value` (which may be `TValue` or an `Atom`) into an atom. If `Value` is encountered,
 * then it is assumed to be `ok`, and will be wrapped as so. If an error is desired then it must
 * be wrapped with the `err` helper.
 */
export function normalise<TValue, TErr>(value: Value<TValue, TErr>): Atom<TValue, TErr> {
    if (
        value !== null
            && typeof value === "object"
            && "type" in value
            && (value.type === VALUE || value.type === ERROR || value.type === UNKNOWN || value.type === END)
    ) {
        return value;
    } else {
        return ok(value);
    }
}

